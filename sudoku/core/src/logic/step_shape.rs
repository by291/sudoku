//! Structural single-step checks, independent of a board or clue identity.
use std::collections::BTreeSet;

use super::techniques::Technique;
use super::types::{
    AdvancedEvidenceKind, Evidence, LogicalAction, LogicalStep, RuleEvidence, RuleEvidenceKind,
};
use crate::rules::context::validate_rules;
use crate::rules::types::{Arrow, PuzzleRules, Unit, UnitKind};
use crate::types::BOARD_SIZE;

pub(crate) const STEP_COUNT_LIMIT: usize = 500;

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
                || validate_rules(&PuzzleRules::Thermo {
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
                && validate_rules(&PuzzleRules::Arrow {
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

pub(crate) fn valid_step_shape(step: &LogicalStep) -> bool {
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
                && premises.len() <= STEP_COUNT_LIMIT
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
