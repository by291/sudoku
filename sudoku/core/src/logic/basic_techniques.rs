use super::evidence::unit_evidence;
use super::pattern_facts::mask_of;
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
    // A cell occurs in several units; only its first occurrence can determine the selected step.
    for &(cell, index) in state.rules.single_cells() {
        if let Some(digit) = state.candidates[cell].single() {
            return Some(LogicalStep {
                technique: Technique::NakedSingle,
                action: LogicalAction::Placement {
                    cell,
                    digit: digit.value(),
                },
                evidence: unit_evidence(
                    state,
                    &state.rules.context().units[index],
                    vec![cell],
                    vec![digit.value()],
                ),
            });
        }
    }
    None
}

fn hidden_single(state: &LogicalWorkspace) -> Option<LogicalStep> {
    let positions = state.digit_positions();
    for (index, unit) in state.rules.context().units.iter().enumerate() {
        for (digit, &positions) in positions.iter().enumerate() {
            let cells = positions & state.rules.unit_masks()[index];
            if cells.count_ones() == 1 {
                let cell = cells.trailing_zeros() as usize;
                let digit = (digit + 1) as u8;
                return Some(LogicalStep {
                    technique: Technique::HiddenSingle,
                    action: LogicalAction::Placement { cell, digit },
                    evidence: unit_evidence(state, unit, vec![cell], vec![digit]),
                });
            }
        }
    }
    None
}

fn locked_candidate(state: &LogicalWorkspace) -> Option<LogicalStep> {
    let classic = matches!(state.rules.rules(), PuzzleRules::Classic);
    let units = &state.rules.context().units;
    let unit_masks = state.rules.unit_masks();
    let positions = state.digit_positions();
    for (index, source) in units.iter().enumerate() {
        for (digit, &positions) in positions.iter().enumerate() {
            let cells = positions & unit_masks[index];
            if cells.count_ones() < 2 {
                continue;
            }
            for (other, target) in units.iter().enumerate() {
                if index == other
                    || (classic
                        && (source.kind == target.kind
                            || (source.kind != UnitKind::Box && target.kind != UnitKind::Box)))
                {
                    continue;
                }
                if cells & !unit_masks[other] != 0 {
                    continue;
                }
                let removed = positions & unit_masks[other] & !unit_masks[index];
                if removed == 0 {
                    continue;
                }
                let digit = (digit + 1) as u8;
                let removals = target
                    .cells
                    .iter()
                    .copied()
                    .filter(|&cell| removed & (1_u128 << cell) != 0)
                    .map(|cell| Removal { cell, digit })
                    .collect();
                // Evidence follows authored unit order even when regions are not sorted.
                return elimination(
                    state,
                    Technique::LockedCandidate,
                    source,
                    source
                        .cells
                        .iter()
                        .copied()
                        .filter(|&cell| cells & (1_u128 << cell) != 0),
                    mask_of(digit),
                    removals,
                );
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
    let positions = state.digit_positions();
    for (index, unit) in state.rules.context().units.iter().enumerate() {
        let unit_mask = state.rules.unit_masks()[index];
        for first in 1..=9 {
            let selected = positions[usize::from(first - 1)] & unit_mask;
            if selected.count_ones() != 2 {
                continue;
            }
            for second in first + 1..=9 {
                if positions[usize::from(second - 1)] & unit_mask != selected {
                    continue;
                }
                let cells = unit
                    .cells
                    .iter()
                    .copied()
                    .filter(|&cell| selected & (1_u128 << cell) != 0);
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
                    cells,
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
