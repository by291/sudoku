//! Bind a step to exact clues and validate its proof before advancing replay state.
use super::advanced_evidence::validate_advanced_step;
use super::solver::find_step;
use super::techniques::Technique;
use super::types::{
    Evidence, LogicalAction, LogicalStep, LogicalWorkspace, RuleEvidence, RuleEvidenceKind,
};
use super::unit_evidence::valid_authored_unit_action;
use super::workspace::apply_established_step;
use crate::budget::WorkBudget;
use crate::rules::types::{PreparedRules, RuleConstraint};
use crate::types::{BOARD_SIZE, Bounded, CoreResult, EngineError};

/// Default single-step/chain proof budget, matching the transport validator.
pub const HINT_VALIDATION_WORK_LIMIT: u64 = 1_000_000;
const ADVANCED_PROOF_WORK: u64 = (BOARD_SIZE * BOARD_SIZE) as u64;

pub(crate) fn invalid() -> EngineError {
    EngineError::invalid("Hint evidence does not match the requested rules")
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

#[derive(Clone, Copy)]
pub(crate) enum ValidationMode {
    Hint,
    Teaching,
}

pub(crate) fn validate_step_and_apply(
    step: &mut LogicalStep,
    context: &PreparedRules,
    state: &mut Option<LogicalWorkspace>,
    budget: &mut WorkBudget,
    mode: ValidationMode,
) -> CoreResult<()> {
    match &mut step.evidence {
        Evidence::Advanced(_) => {
            let Some(state) = state.as_ref() else {
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
            let Some(actual_unit) = context
                .context()
                .units
                .iter()
                .find(|candidate| candidate.kind == unit.kind && candidate.index == unit.index)
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

    if let Some(state) = state.as_mut() {
        if !matches!(step.evidence, Evidence::Advanced(_)) {
            if matches!(mode, ValidationMode::Teaching)
                && matches!(step.evidence, Evidence::Unit { .. })
            {
                if !valid_authored_unit_action(state, step) {
                    return Err(invalid());
                }
            } else {
                let Bounded::Complete(Some(expected)) = find_step(state, &[step.technique], budget)
                else {
                    return Err(invalid());
                };
                let matches = match (&expected.action, &step.action, mode) {
                    (
                        LogicalAction::Elimination { removals: expected },
                        LogicalAction::Elimination { removals: actual },
                        ValidationMode::Teaching,
                    ) => {
                        expected.len() == actual.len()
                            && actual.iter().all(|removal| expected.contains(removal))
                    }
                    _ => expected.action == step.action,
                };
                if !matches {
                    return Err(invalid());
                }
            }
        }

        apply_established_step(state, step);
    }
    Ok(())
}
