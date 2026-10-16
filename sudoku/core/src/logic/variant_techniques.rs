use super::pattern_facts::mask_of;
use super::techniques::Technique;
use super::types::{
    CageMemo, CandidateDomain, CellBound, Evidence, LogicalAction, LogicalStep, LogicalWorkspace,
    Removal, RuleEvidence, RuleEvidenceKind, StepOutcome,
};
use super::workspace::{all_digits, local_domains};
use crate::budget::WorkBudget;
use crate::constraints::support::raw_for_constraint;
use crate::constraints::types::{MAX_CONSTRAINT_CELLS, SupportMasksResult};
use crate::rules::types::RuleConstraint;
use crate::types::{Bounded, CandidateMask};

pub(crate) fn matches_rule_technique(technique: Technique, constraint: &RuleConstraint) -> bool {
    match constraint {
        RuleConstraint::Cage { .. } => matches!(
            technique,
            Technique::CageDistinct | Technique::CageRemainder | Technique::CageCombination
        ),
        RuleConstraint::Thermo { .. } => technique == Technique::ThermoBound,
        RuleConstraint::Arrow { .. } => matches!(
            technique,
            Technique::ArrowEquation | Technique::ArrowCombination
        ),
    }
}

fn combination_support(
    state: &mut LogicalWorkspace,
    index: usize,
    budget: &mut WorkBudget,
) -> SupportMasksResult {
    let constraint = &state.rules.context().constraints[index];
    let cage = matches!(constraint, RuleConstraint::Cage { .. });
    let domains = std::array::from_fn(|position| {
        if !cage || position >= constraint.cells().len() {
            return CandidateMask::EMPTY;
        }
        let cell = constraint.cells()[position];
        if state.board.values()[cell] == 0 {
            state.candidates[cell]
        } else {
            CandidateMask::from_computed_bits(mask_of(state.board.values()[cell]))
        }
    });
    if cage
        && let Some(previous) = &state.cage_memo[index]
        && previous.domains == domains
    {
        // Geometry is immutable and private to this workspace. The caller still charges each visit.
        return Bounded::Complete(previous.supports);
    }

    let result = if let Some(support) = &state.support {
        support.query_at(&state.board, &state.candidates, index, budget)
    } else {
        raw_for_constraint(
            &state.board,
            &state.candidates,
            &state.rules,
            constraint,
            budget,
        )
    };
    if cage && let Bounded::Complete(support) = &result {
        // Keep one owned complete snapshot per cage; an interrupted enumeration proves nothing.
        state.cage_memo[index] = Some(CageMemo {
            domains,
            supports: *support,
        });
    }
    result
}

pub(crate) fn clue_evidence(state: &LogicalWorkspace, constraint: &RuleConstraint) -> RuleEvidence {
    let cells = constraint.cells().to_vec();
    let domains = || {
        cells
            .iter()
            .copied()
            .zip(local_domains(state, &cells))
            .map(|(cell, mask)| CandidateDomain { cell, mask })
            .collect()
    };
    let kind = match constraint {
        RuleConstraint::Cage { sum, .. } => RuleEvidenceKind::Cage {
            sum: *sum,
            domains: domains(),
        },
        RuleConstraint::Thermo { .. } => RuleEvidenceKind::Thermo {
            path: cells.clone(),
            bounds: vec![],
        },
        RuleConstraint::Arrow { .. } => RuleEvidenceKind::Arrow {
            circle: cells[0],
            shaft: cells[1..].to_vec(),
            domains: domains(),
        },
    };
    RuleEvidence {
        constraint_id: constraint.id().to_string(),
        cells,
        digits: all_digits(),
        kind,
    }
}

fn deduction_action(
    state: &LogicalWorkspace,
    cells: &[usize],
    supported: &[u16],
) -> Option<LogicalAction> {
    let mut removals = vec![];
    for (index, &cell) in cells.iter().enumerate() {
        if state.board.values()[cell] != 0 {
            continue;
        }

        let before = state.candidates[cell].bits();
        let remaining = CandidateMask::from_computed_bits(before & supported[index]);
        if before != remaining.bits()
            && let Some(digit) = remaining.single()
        {
            return Some(LogicalAction::Placement {
                cell,
                digit: digit.value(),
            });
        }
        for digit in CandidateMask::from_computed_bits(before & !supported[index]).digits() {
            removals.push(Removal {
                cell,
                digit: digit.value(),
            });
        }
    }
    if removals.is_empty() {
        None
    } else {
        Some(LogicalAction::Elimination { removals })
    }
}

fn simple_step(
    state: &LogicalWorkspace,
    constraint: &RuleConstraint,
    technique: Technique,
) -> Option<LogicalStep> {
    let cells = constraint.cells();
    if technique == Technique::ThermoBound
        && let RuleConstraint::Thermo { .. } = constraint
    {
        let mut supported = [0; MAX_CONSTRAINT_CELLS];
        for (position, mask) in supported.iter_mut().take(cells.len()).enumerate() {
            let mut minimum = position as i32 + 1;
            let mut maximum = 9 - (cells.len() - position - 1) as i32;
            for (index, &other) in cells.iter().enumerate() {
                if state.board.values()[other] == 0 || index == position {
                    continue;
                }
                if index < position {
                    minimum = minimum
                        .max(i32::from(state.board.values()[other]) + (position - index) as i32);
                } else {
                    maximum = maximum
                        .min(i32::from(state.board.values()[other]) - (index - position) as i32);
                }
            }
            *mask = (1..=9)
                .filter(|&digit| i32::from(digit) >= minimum && i32::from(digit) <= maximum)
                .fold(0, |bits, digit| bits | mask_of(digit));
        }
        let action = deduction_action(state, cells, &supported)?;
        let mut evidence = clue_evidence(state, constraint);
        if let RuleEvidenceKind::Thermo { bounds, .. } = &mut evidence.kind {
            *bounds = cells
                .iter()
                .copied()
                .zip(&supported)
                .filter_map(|(cell, &bits)| {
                    if bits == 0 {
                        return None;
                    }
                    Some(CellBound {
                        cell,
                        min: (bits.trailing_zeros() + 1) as u8,
                        max: (u16::BITS - bits.leading_zeros()) as u8,
                    })
                })
                .collect();
        }
        return Some(LogicalStep {
            technique,
            evidence: Evidence::Rule(evidence),
            action,
        });
    }
    if technique == Technique::CageDistinct && matches!(constraint, RuleConstraint::Cage { .. }) {
        let used = cells
            .iter()
            .filter(|&&cell| state.board.values()[cell] != 0)
            .fold(0, |bits, &cell| bits | mask_of(state.board.values()[cell]));
        let action = deduction_action(state, cells, &[!used; MAX_CONSTRAINT_CELLS])?;
        return Some(LogicalStep {
            technique,
            evidence: Evidence::Rule(clue_evidence(state, constraint)),
            action,
        });
    }
    if (technique == Technique::CageRemainder && matches!(constraint, RuleConstraint::Cage { .. }))
        || (technique == Technique::ArrowEquation
            && matches!(constraint, RuleConstraint::Arrow { .. }))
    {
        let mut unknown = cells
            .iter()
            .copied()
            .filter(|&cell| state.board.values()[cell] == 0);
        let cell = unknown.next()?;
        if unknown.next().is_some() {
            return None;
        }

        let total: i32 = cells
            .iter()
            .map(|&cell| i32::from(state.board.values()[cell]))
            .sum();
        let answer = match constraint {
            RuleConstraint::Cage { sum, .. } => i32::from(*sum) - total,
            RuleConstraint::Arrow { .. } => {
                if cell == cells[0] {
                    total
                } else {
                    // Total includes the circle, so remove it before subtracting the known shaft sum.
                    let known_shaft_sum = total - i32::from(state.board.values()[cells[0]]);
                    i32::from(state.board.values()[cells[0]]) - known_shaft_sum
                }
            }
            RuleConstraint::Thermo { .. } => return None,
        };
        if !(1..=9).contains(&answer) || state.candidates[cell].bits() & mask_of(answer as u8) == 0
        {
            return None;
        }
        return Some(LogicalStep {
            technique,
            evidence: Evidence::Rule(clue_evidence(state, constraint)),
            action: LogicalAction::Placement {
                cell,
                digit: answer as u8,
            },
        });
    }
    None
}

/// Mutates only the workspace's local memo; returned steps own their geometry and proof domains.
pub fn find_variant_step(
    state: &mut LogicalWorkspace,
    techniques: &[Technique],
    budget: &mut WorkBudget,
) -> StepOutcome {
    for &technique in techniques {
        for index in 0..state.rules.context().constraints.len() {
            let constraint = &state.rules.context().constraints[index];
            if !matches_rule_technique(technique, constraint)
                || constraint
                    .cells()
                    .iter()
                    .all(|&cell| state.board.values()[cell] != 0)
            {
                continue;
            }
            if !budget.consume(1) {
                return Bounded::BudgetExhausted;
            }
            if let Some(step) = simple_step(state, constraint, technique) {
                return Bounded::Complete(Some(Box::new(step)));
            }
            if !matches!(
                technique,
                Technique::CageCombination | Technique::ArrowCombination
            ) {
                continue;
            }

            let Bounded::Complete(support) = combination_support(state, index, budget) else {
                return Bounded::BudgetExhausted;
            };
            let constraint = &state.rules.context().constraints[index];
            if let Some(action) = deduction_action(state, constraint.cells(), support.as_slice()) {
                return Bounded::Complete(Some(Box::new(LogicalStep {
                    technique,
                    action,
                    evidence: Evidence::Rule(clue_evidence(state, constraint)),
                })));
            }
        }
    }
    Bounded::Complete(None)
}
