use std::collections::BTreeSet;

use super::advanced_evidence::validate_advanced_step;
use super::solver::find_step;
use super::techniques::Technique;
use super::types::{
    AdvancedEvidenceKind, Evidence, LogicalAction, LogicalStep, RuleEvidence, RuleEvidenceKind,
};
use super::workspace::{apply_step, create_workspace};
use crate::budget::WorkBudget;
use crate::hint::HintResult;
use crate::rules::context::compile_rules;
use crate::rules::types::{Arrow, PuzzleRules, RuleConstraint, Unit, UnitKind};
use crate::types::{BOARD_SIZE, Board, Bounded, CoreResult, EngineError};

const HINT_STEP_LIMIT: usize = 500;
/// Maximum proof replay work, matching the existing transport validator.
pub const HINT_VALIDATION_WORK_LIMIT: u64 = 1000000;
const ADVANCED_PROOF_WORK: u64 = (BOARD_SIZE * BOARD_SIZE) as u64;

fn invalid() -> EngineError {
    EngineError::invalid("Hint evidence does not match the requested rules")
}

fn unique<T: Ord>(values: &[T]) -> bool {
    values.iter().collect::<BTreeSet<_>>().len() == values.len()
}

fn cell_list(cells: &[usize], limit: usize) -> bool {
    !cells.is_empty()
        && cells.len() <= limit
        && cells.iter().all(|&cell| cell < BOARD_SIZE)
        && unique(cells)
}

fn digit_list(digits: &[u8]) -> bool {
    !digits.is_empty()
        && digits.len() <= 9
        && digits.iter().all(|digit| (1..=9).contains(digit))
        && unique(digits)
}

fn valid_unit(unit: &Unit) -> bool {
    unit.index
        < if unit.kind == UnitKind::Diagonal {
            2
        } else {
            9
        }
}

fn valid_rule_evidence(evidence: &RuleEvidence) -> bool {
    if !cell_list(&evidence.cells, 10) || !digit_list(&evidence.digits) {
        return false;
    }
    match &evidence.kind {
        RuleEvidenceKind::Thermo { path, bounds } => {
            if !cell_list(path, 10)
                || compile_rules(&PuzzleRules::Thermo {
                    paths: vec![path.clone()],
                })
                .is_err()
                || bounds.len() != evidence.cells.len()
            {
                return false;
            }
            bounds.iter().all(|bound| {
                evidence.cells.contains(&bound.cell)
                    && (1..=9).contains(&bound.min)
                    && (bound.min..=9).contains(&bound.max)
            }) && unique(&bounds.iter().map(|bound| bound.cell).collect::<Vec<_>>())
        }
        RuleEvidenceKind::Cage { sum, domains } => {
            let count = evidence.cells.len();
            count <= 9
                && usize::from(*sum) >= count * (count + 1) / 2
                && usize::from(*sum) <= count * (19 - count) / 2
                && valid_rule_domains(evidence, domains)
        }
        RuleEvidenceKind::Arrow {
            circle,
            shaft,
            domains,
        } => {
            cell_list(shaft, 10)
                && compile_rules(&PuzzleRules::Arrow {
                    arrows: vec![Arrow {
                        circle: *circle,
                        shaft: shaft.clone(),
                    }],
                })
                .is_ok()
                && valid_rule_domains(evidence, domains)
        }
    }
}

fn valid_rule_domains(evidence: &RuleEvidence, domains: &[super::types::CandidateDomain]) -> bool {
    domains.len() == evidence.cells.len()
        && domains
            .iter()
            .zip(&evidence.cells)
            .all(|(domain, &cell)| domain.cell == cell && domain.mask.bits() != 0)
}

fn matches_rule_kind(technique: Technique, kind: &RuleEvidenceKind) -> bool {
    match kind {
        RuleEvidenceKind::Cage { .. } => matches!(
            technique,
            Technique::CageDistinct | Technique::CageRemainder | Technique::CageCombination
        ),
        RuleEvidenceKind::Thermo { .. } => technique == Technique::ThermoBound,
        RuleEvidenceKind::Arrow { .. } => matches!(
            technique,
            Technique::ArrowEquation | Technique::ArrowCombination
        ),
    }
}

fn valid_step_shape(step: &LogicalStep) -> bool {
    let action_valid = match &step.action {
        LogicalAction::Placement { cell, digit } => *cell < BOARD_SIZE && (1..=9).contains(digit),
        LogicalAction::Elimination { removals } => {
            !removals.is_empty()
                && removals.len() <= BOARD_SIZE * 9
                && removals
                    .iter()
                    .all(|removal| removal.cell < BOARD_SIZE && (1..=9).contains(&removal.digit))
        }
    };
    if !action_valid {
        return false;
    }
    match &step.evidence {
        Evidence::Rule(evidence) => {
            valid_rule_evidence(evidence) && matches_rule_kind(step.technique, &evidence.kind)
        }
        Evidence::Unit {
            unit,
            cells,
            digits,
            premises,
            units,
        } => {
            step.technique.is_classic()
                && !step.technique.is_advanced()
                && valid_unit(unit)
                && cell_list(cells, 9)
                && digit_list(digits)
                && premises.len() <= HINT_STEP_LIMIT
                && premises.iter().all(valid_rule_evidence)
                && units
                    .as_ref()
                    .is_none_or(|units| units.len() <= 29 && units.iter().all(valid_unit))
        }
        Evidence::Advanced(evidence) => {
            if !step.technique.is_advanced()
                || !cell_list(&evidence.cells, BOARD_SIZE)
                || !digit_list(&evidence.digits)
                || evidence.domains.len() != BOARD_SIZE
                || !evidence
                    .domains
                    .iter()
                    .enumerate()
                    .all(|(index, domain)| domain.cell == index)
            {
                return false;
            }
            match &evidence.kind {
                AdvancedEvidenceKind::Subset { unit, .. } => valid_unit(unit),
                AdvancedEvidenceKind::Fish { bases, covers } => {
                    (2..=3).contains(&bases.len())
                        && covers.len() == bases.len()
                        && bases.iter().chain(covers).all(valid_unit)
                }
                AdvancedEvidenceKind::Wing { pivot, wings } => {
                    *pivot < BOARD_SIZE && cell_list(wings, 2)
                }
                AdvancedEvidenceKind::Coloring { colors, links, .. } => {
                    colors.iter().all(|color| cell_list(color, BOARD_SIZE))
                        && !links.is_empty()
                        && links.len() <= 27
                        && links
                            .iter()
                            .all(|link| valid_unit(&link.unit) && cell_list(&link.cells, 2))
                }
            }
        }
    }
}

fn clue_matches(evidence: &RuleEvidence, constraints: &[RuleConstraint]) -> bool {
    let Some(constraint) = constraints
        .iter()
        .find(|constraint| constraint.id() == evidence.constraint_id)
    else {
        return false;
    };
    if constraint.cells() != evidence.cells {
        return false;
    }
    match (&evidence.kind, constraint) {
        (RuleEvidenceKind::Cage { sum, .. }, RuleConstraint::Cage { sum: expected, .. }) => {
            sum == expected
        }
        (RuleEvidenceKind::Thermo { path, .. }, RuleConstraint::Thermo { cells, .. }) => {
            path == cells
        }
        (RuleEvidenceKind::Arrow { circle, shaft, .. }, RuleConstraint::Arrow { cells, .. }) => {
            *circle == cells[0] && *shaft == cells[1..]
        }
        _ => false,
    }
}

/// Validate owned typed evidence against exact ordered clues; optional board enables candidate replay.
/// Basic/rule deductions retain replay validation; advanced patterns use their independent proof checker.
pub fn validate_hint_evidence(
    hint: &HintResult,
    rules: &PuzzleRules,
    board: Option<&Board>,
) -> CoreResult<HintResult> {
    let mut parsed = hint.clone();
    let HintResult::Deduction { steps, placement } = &mut parsed else {
        if matches!(parsed, HintResult::ReviewEntry { cell } if cell >= BOARD_SIZE) {
            return Err(invalid());
        }
        return Ok(parsed);
    };
    if steps.is_empty()
        || steps.len() > HINT_STEP_LIMIT
        || !steps.iter().all(valid_step_shape)
        || steps[..steps.len() - 1]
            .iter()
            .any(|step| matches!(step.action, LogicalAction::Placement { .. }))
        || steps.last().is_none_or(|step| {
            step.action
                != (LogicalAction::Placement {
                    cell: placement.cell,
                    digit: placement.digit,
                })
        })
    {
        return Err(invalid());
    }

    let context = compile_rules(rules)?;
    let mut state = board.map(|board| create_workspace(board, &context));
    let mut budget = WorkBudget::new(HINT_VALIDATION_WORK_LIMIT);
    for step in steps {
        match &mut step.evidence {
            Evidence::Advanced(_) => {
                let Some(state) = &state else {
                    return Err(invalid());
                };
                if !budget.consume(ADVANCED_PROOF_WORK) || !validate_advanced_step(state, step) {
                    return Err(invalid());
                }
            }
            Evidence::Unit {
                unit,
                cells,
                premises,
                units,
                ..
            } => {
                let Some(actual_unit) =
                    context.context().units.iter().find(|candidate| {
                        candidate.kind == unit.kind && candidate.index == unit.index
                    })
                else {
                    return Err(invalid());
                };
                // The existing parser normalizes an omitted related-unit list to an empty list.
                let units = units.get_or_insert_with(Vec::new);
                if !cells.iter().all(|cell| actual_unit.cells.contains(cell))
                    || !premises
                        .iter()
                        .all(|evidence| clue_matches(evidence, &context.context().constraints))
                    || !units.iter().all(|unit| {
                        context.context().units.iter().any(|candidate| {
                            candidate.kind == unit.kind && candidate.index == unit.index
                        })
                    })
                {
                    return Err(invalid());
                }
                match &step.action {
                    LogicalAction::Placement { cell, .. } if !actual_unit.cells.contains(cell) => {
                        return Err(invalid());
                    }
                    LogicalAction::Elimination { removals }
                        if step.technique != Technique::LockedCandidate
                            && !removals
                                .iter()
                                .all(|removal| actual_unit.cells.contains(&removal.cell)) =>
                    {
                        return Err(invalid());
                    }
                    _ => {}
                }
            }
            Evidence::Rule(evidence) => {
                if !clue_matches(evidence, &context.context().constraints) {
                    return Err(invalid());
                }
                let affected = match &step.action {
                    LogicalAction::Placement { cell, .. } => vec![*cell],
                    LogicalAction::Elimination { removals } => {
                        removals.iter().map(|removal| removal.cell).collect()
                    }
                };
                if !affected.iter().all(|cell| evidence.cells.contains(cell)) {
                    return Err(invalid());
                }
            }
        }
        if let Some(state) = &mut state {
            if !matches!(step.evidence, Evidence::Advanced(_)) {
                let Bounded::Complete(Some(expected)) =
                    find_step(state, &[step.technique], &mut budget)
                else {
                    return Err(invalid());
                };
                if expected.action != step.action {
                    return Err(invalid());
                }
            }
            apply_step(state, step);
        }
    }
    Ok(parsed)
}
