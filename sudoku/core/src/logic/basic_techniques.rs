use super::evidence::{UnitWitness, unit_evidence};
use super::pattern_facts::mask_of;
use super::techniques::Technique;
use super::types::{LogicalAction, LogicalStep, LogicalWorkspace, Removal};
use crate::rules::types::{PuzzleRules, SudokuUnit, UnitKind};
use crate::types::{CandidateMask, UNIT_SIZE};

struct UnitElimination<'a, Cells> {
    state: &'a LogicalWorkspace,
    technique: Technique,
    unit: &'a SudokuUnit,
    cells: Cells,
    digits: u16,
    removals: Vec<Removal>,
}

fn elimination(input: UnitElimination<'_, impl IntoIterator<Item = usize>>) -> Option<LogicalStep> {
    let UnitElimination {
        state,
        technique,
        unit,
        cells,
        digits,
        mut removals,
    } = input;
    if removals.is_empty() {
        return None;
    }

    // Canonical action order is independent of the authored unit order in the witness.
    removals.sort_by_key(|removal| (removal.cell, removal.digit));
    let digit_values = CandidateMask::from_computed_bits(digits)
        .digits()
        .map(|digit| digit.value());

    Some(LogicalStep {
        technique,
        evidence: unit_evidence(UnitWitness {
            state,
            unit,
            cells: cells.into_iter().collect(),
            digits: digit_values.collect(),
        }),
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
                evidence: unit_evidence(UnitWitness {
                    state,
                    unit: &state.rules.context().units[index],
                    cells: vec![cell],
                    digits: vec![digit.value()],
                }),
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
                    evidence: unit_evidence(UnitWitness {
                        state,
                        unit,
                        cells: vec![cell],
                        digits: vec![digit],
                    }),
                });
            }
        }
    }
    None
}

struct LockedPositions {
    unit_index: usize,
    digit_index: usize,
    positions: u128,
    cells: u128,
}

fn find_locked_elimination(
    state: &LogicalWorkspace,
    source: &SudokuUnit,
    lock: LockedPositions,
) -> Option<LogicalStep> {
    let is_classic = matches!(state.rules.rules(), PuzzleRules::Classic);
    let units = &state.rules.context().units;
    let unit_masks = state.rules.unit_masks();

    for (other, target) in units.iter().enumerate() {
        // Classic permits box-line intersections. Variants use their full-unit topology.
        if lock.unit_index == other
            || (is_classic
                && (source.kind == target.kind
                    || (source.kind != UnitKind::Box && target.kind != UnitKind::Box)))
        {
            continue;
        }

        // Every source position must lie in the target unit for the lock to apply.
        if lock.cells & !unit_masks[other] != 0 {
            continue;
        }
        let removed = lock.positions & unit_masks[other] & !unit_masks[lock.unit_index];
        if removed == 0 {
            continue;
        }

        let digit = (lock.digit_index + 1) as u8;
        let target_cells = target.cells.iter().copied();
        let removals = target_cells
            .filter(|&cell| removed & (1_u128 << cell) != 0)
            .map(|cell| Removal { cell, digit })
            .collect();

        // Evidence follows authored unit order even when regions are not sorted.
        let cells = source
            .cells
            .iter()
            .copied()
            .filter(|&cell| lock.cells & (1_u128 << cell) != 0);
        return elimination(UnitElimination {
            state,
            technique: Technique::LockedCandidate,
            unit: source,
            cells,
            digits: mask_of(digit),
            removals,
        });
    }
    None
}

fn locked_candidate(state: &LogicalWorkspace) -> Option<LogicalStep> {
    let units = &state.rules.context().units;
    let unit_masks = state.rules.unit_masks();
    let positions = state.digit_positions();

    for (index, source) in units.iter().enumerate() {
        for (digit_index, &digit_positions) in positions.iter().enumerate() {
            let cells = digit_positions & unit_masks[index];
            if cells.count_ones() < 2 {
                continue;
            }

            let lock = LockedPositions {
                unit_index: index,
                digit_index,
                positions: digit_positions,
                cells,
            };
            if let Some(step) = find_locked_elimination(state, source, lock) {
                return Some(step);
            }
        }
    }
    None
}

fn collect_removals(
    state: &LogicalWorkspace,
    targets: impl IntoIterator<Item = usize>,
    digits: u16,
) -> Vec<Removal> {
    let mut removals = vec![];
    for cell in targets {
        let removed_digits =
            CandidateMask::from_computed_bits(state.candidates[cell].bits() & digits);
        for digit in removed_digits.digits() {
            removals.push(Removal {
                cell,
                digit: digit.value(),
            });
        }
    }
    removals
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

            let targets = unit
                .cells
                .iter()
                .copied()
                .filter(|&target| !cells.clone().any(|cell| cell == target));
            let removals = collect_removals(state, targets, bits);

            let step = elimination(UnitElimination {
                state,
                technique: Technique::NakedPair,
                unit,
                cells,
                digits: bits,
                removals,
            });
            if step.is_some() {
                return step;
            }
        }
    }
    None
}

fn hidden_pair_in_unit(
    state: &LogicalWorkspace,
    unit: &SudokuUnit,
    unit_mask: u128,
) -> Option<LogicalStep> {
    let positions = state.digit_positions();

    for first in 1..=UNIT_SIZE as u8 {
        let selected = positions[usize::from(first - 1)] & unit_mask;
        if selected.count_ones() != 2 {
            continue;
        }
        for second in first + 1..=UNIT_SIZE as u8 {
            // Both digits must be confined to exactly the same two cells.
            if positions[usize::from(second - 1)] & unit_mask != selected {
                continue;
            }

            let unit_cells = unit.cells.iter().copied();
            let cells = unit_cells.filter(|&cell| selected & (1_u128 << cell) != 0);
            let digits = mask_of(first) | mask_of(second);
            let removals = collect_removals(state, cells.clone(), !digits);

            if let Some(step) = elimination(UnitElimination {
                state,
                technique: Technique::HiddenPair,
                unit,
                cells,
                digits,
                removals,
            }) {
                return Some(step);
            }
        }
    }

    None
}

fn hidden_pair(state: &LogicalWorkspace) -> Option<LogicalStep> {
    let units = &state.rules.context().units;
    for (unit, &unit_mask) in units.iter().zip(state.rules.unit_masks()) {
        if let Some(step) = hidden_pair_in_unit(state, unit, unit_mask) {
            return Some(step);
        }
    }

    None
}

/// Find the first applicable deduction for a basic technique.
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
