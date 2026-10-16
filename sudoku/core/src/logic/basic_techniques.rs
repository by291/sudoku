use super::evidence::unit_evidence;
use super::pattern_facts::{candidate_position_iter, mask_of};
use super::techniques::Technique;
use super::types::{LogicalAction, LogicalStep, LogicalWorkspace, Removal};
use crate::rules::types::{PuzzleRules, SudokuUnit, UnitKind};
use crate::types::CandidateMask;

fn elimination(
    state: &LogicalWorkspace,
    technique: Technique,
    unit: &SudokuUnit,
    cells: impl IntoIterator<Item = usize>,
    digits: u16,
    mut removals: Vec<Removal>,
) -> Option<LogicalStep> {
    if removals.is_empty() {
        return None;
    }
    removals.sort_by_key(|removal| (removal.cell, removal.digit));
    Some(LogicalStep {
        technique,
        evidence: unit_evidence(
            state,
            unit,
            cells.into_iter().collect(),
            CandidateMask::from_computed_bits(digits)
                .digits()
                .map(|digit| digit.value())
                .collect(),
        ),
        action: LogicalAction::Elimination { removals },
    })
}

fn naked_single(state: &LogicalWorkspace) -> Option<LogicalStep> {
    for unit in &state.rules.context().units {
        for &cell in &unit.cells {
            if state.board.values()[cell] == 0
                && let Some(digit) = state.candidates[cell].single()
            {
                return Some(LogicalStep {
                    technique: Technique::NakedSingle,
                    action: LogicalAction::Placement {
                        cell,
                        digit: digit.value(),
                    },
                    evidence: unit_evidence(state, unit, vec![cell], vec![digit.value()]),
                });
            }
        }
    }
    None
}

fn hidden_single(state: &LogicalWorkspace) -> Option<LogicalStep> {
    for unit in &state.rules.context().units {
        for digit in 1..=9 {
            let cells = candidate_position_iter(state, &unit.cells, digit);
            if cells.clone().count() == 1 {
                return Some(LogicalStep {
                    technique: Technique::HiddenSingle,
                    action: LogicalAction::Placement {
                        cell: cells.clone().next()?,
                        digit,
                    },
                    evidence: unit_evidence(state, unit, cells.collect(), vec![digit]),
                });
            }
        }
    }
    None
}

fn locked_candidate(state: &LogicalWorkspace) -> Option<LogicalStep> {
    let classic = matches!(state.rules.rules(), PuzzleRules::Classic);
    for (index, source) in state.rules.context().units.iter().enumerate() {
        for digit in 1..=9 {
            let cells = candidate_position_iter(state, &source.cells, digit);
            if cells.clone().count() < 2 {
                continue;
            }
            for (other, target) in state.rules.context().units.iter().enumerate() {
                if index == other
                    || (classic
                        && (source.kind == target.kind
                            || (source.kind != UnitKind::Box && target.kind != UnitKind::Box)))
                {
                    continue;
                }
                if !cells.clone().all(|cell| target.cells.contains(&cell)) {
                    continue;
                }
                let removals = candidate_position_iter(state, &target.cells, digit)
                    .filter(|cell| !source.cells.contains(cell))
                    .map(|cell| Removal { cell, digit })
                    .collect();
                if let Some(step) = elimination(
                    state,
                    Technique::LockedCandidate,
                    source,
                    cells.clone(),
                    mask_of(digit),
                    removals,
                ) {
                    return Some(step);
                }
            }
        }
    }
    None
}

fn naked_pair(state: &LogicalWorkspace) -> Option<LogicalStep> {
    for unit in &state.rules.context().units {
        for &cell in &unit.cells {
            if state.board.values()[cell] != 0 {
                continue;
            }

            let bits = state.candidates[cell].bits();
            if state.candidates[cell].count() != 2 {
                continue;
            }

            let cells = unit.cells.iter().copied().filter(|&candidate| {
                state.board.values()[candidate] == 0 && state.candidates[candidate].bits() == bits
            });
            if cells.clone().count() != 2 {
                continue;
            }

            let mut removals = vec![];
            for &target in &unit.cells {
                if cells.clone().any(|cell| cell == target) {
                    continue;
                }
                for digit in state.candidates[cell].digits().map(|digit| digit.value()) {
                    if state.candidates[target].bits() & mask_of(digit) != 0 {
                        removals.push(Removal {
                            cell: target,
                            digit,
                        });
                    }
                }
            }
            if let Some(step) =
                elimination(state, Technique::NakedPair, unit, cells, bits, removals)
            {
                return Some(step);
            }
        }
    }
    None
}

fn hidden_pair(state: &LogicalWorkspace) -> Option<LogicalStep> {
    for unit in &state.rules.context().units {
        for first in 1..=9 {
            let cells = candidate_position_iter(state, &unit.cells, first);
            if cells.clone().count() != 2 {
                continue;
            }
            for second in first + 1..=9 {
                if !candidate_position_iter(state, &unit.cells, second).eq(cells.clone()) {
                    continue;
                }
                let mut removals = vec![];
                for cell in cells.clone() {
                    for digit in state.candidates[cell].digits().map(|digit| digit.value()) {
                        if digit != first && digit != second {
                            removals.push(Removal { cell, digit });
                        }
                    }
                }
                if let Some(step) = elimination(
                    state,
                    Technique::HiddenPair,
                    unit,
                    cells.clone(),
                    mask_of(first) | mask_of(second),
                    removals,
                ) {
                    return Some(step);
                }
            }
        }
    }
    None
}

pub fn find_basic_step(state: &LogicalWorkspace, technique: Technique) -> Option<LogicalStep> {
    match technique {
        Technique::NakedSingle => naked_single(state),
        Technique::HiddenSingle => hidden_single(state),
        Technique::LockedCandidate => locked_candidate(state),
        Technique::NakedPair => naked_pair(state),
        Technique::HiddenPair => hidden_pair(state),
        _ => None,
    }
}
