use super::evidence::unit_evidence;
use super::pattern_facts::{candidate_positions, digits_in, mask_of};
use super::techniques::Technique;
use super::types::{LogicalAction, LogicalStep, LogicalWorkspace, Removal};
use crate::rules::types::{PuzzleRules, SudokuUnit, UnitKind};

fn elimination(
    state: &LogicalWorkspace,
    technique: Technique,
    unit: &SudokuUnit,
    cells: Vec<usize>,
    digits: Vec<u8>,
    mut removals: Vec<Removal>,
) -> Option<LogicalStep> {
    if removals.is_empty() {
        return None;
    }
    removals.sort_by_key(|removal| (removal.cell, removal.digit));
    Some(LogicalStep {
        technique,
        evidence: unit_evidence(state, unit, cells, digits),
        action: LogicalAction::Elimination { removals },
    })
}

fn naked_single(state: &LogicalWorkspace) -> Option<LogicalStep> {
    for unit in &state.rules.context().units {
        for &cell in &unit.cells {
            let digits = digits_in(state.candidates[cell].bits());
            if state.board.values()[cell] == 0 && digits.len() == 1 {
                return Some(LogicalStep {
                    technique: Technique::NakedSingle,
                    action: LogicalAction::Placement {
                        cell,
                        digit: digits[0],
                    },
                    evidence: unit_evidence(state, unit, vec![cell], digits),
                });
            }
        }
    }
    None
}

fn hidden_single(state: &LogicalWorkspace) -> Option<LogicalStep> {
    for unit in &state.rules.context().units {
        for digit in 1..=9 {
            let cells = candidate_positions(state, &unit.cells, digit);
            if cells.len() == 1 {
                return Some(LogicalStep {
                    technique: Technique::HiddenSingle,
                    action: LogicalAction::Placement {
                        cell: cells[0],
                        digit,
                    },
                    evidence: unit_evidence(state, unit, cells, vec![digit]),
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
            let cells = candidate_positions(state, &source.cells, digit);
            if cells.len() < 2 {
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
                if !cells.iter().all(|cell| target.cells.contains(cell)) {
                    continue;
                }
                let removals = candidate_positions(state, &target.cells, digit)
                    .into_iter()
                    .filter(|cell| !source.cells.contains(cell))
                    .map(|cell| Removal { cell, digit })
                    .collect();
                if let Some(step) = elimination(
                    state,
                    Technique::LockedCandidate,
                    source,
                    cells.clone(),
                    vec![digit],
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
            let digits = digits_in(bits);
            if digits.len() != 2 {
                continue;
            }

            let cells: Vec<usize> = unit
                .cells
                .iter()
                .copied()
                .filter(|&candidate| {
                    state.board.values()[candidate] == 0
                        && state.candidates[candidate].bits() == bits
                })
                .collect();
            if cells.len() != 2 {
                continue;
            }

            let mut removals = vec![];
            for &target in &unit.cells {
                if cells.contains(&target) {
                    continue;
                }
                for &digit in &digits {
                    if state.candidates[target].bits() & mask_of(digit) != 0 {
                        removals.push(Removal {
                            cell: target,
                            digit,
                        });
                    }
                }
            }
            if let Some(step) =
                elimination(state, Technique::NakedPair, unit, cells, digits, removals)
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
            let cells = candidate_positions(state, &unit.cells, first);
            if cells.len() != 2 {
                continue;
            }
            for second in first + 1..=9 {
                if candidate_positions(state, &unit.cells, second) != cells {
                    continue;
                }
                let mut removals = vec![];
                for &cell in &cells {
                    for digit in digits_in(state.candidates[cell].bits()) {
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
                    vec![first, second],
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
