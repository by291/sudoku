//! Independent candidate-relative unit proofs for authored exercises.
use super::pattern_facts::{candidate_positions, mask_of};
use super::techniques::Technique;
use super::types::{Evidence, LogicalAction, LogicalStep, LogicalWorkspace};

/// Authored exercises may choose any sound unit pattern, independently of detector traversal order.
pub(crate) fn valid_authored_unit_action(state: &LogicalWorkspace, step: &LogicalStep) -> bool {
    let Evidence::Unit {
        unit,
        cells,
        digits,
        ..
    } = &step.evidence
    else {
        return false;
    };
    let Some(unit) = state
        .rules
        .context()
        .units
        .iter()
        .find(|candidate| candidate.kind == unit.kind && candidate.index == unit.index)
    else {
        return false;
    };
    let equal_cells = |first: &[usize], second: &[usize]| {
        first.len() == second.len() && first.iter().all(|cell| second.contains(cell))
    };
    match (&step.action, step.technique) {
        (LogicalAction::Placement { cell, digit }, Technique::NakedSingle) => {
            cells == &[*cell]
                && digits == &[*digit]
                && state.board.values()[*cell] == 0
                && state.candidates[*cell].bits() == mask_of(*digit)
        }
        (LogicalAction::Placement { cell, digit }, Technique::HiddenSingle) => {
            cells == &[*cell]
                && digits == &[*digit]
                && candidate_positions(state, &unit.cells, *digit) == [*cell]
        }
        (LogicalAction::Elimination { removals }, Technique::LockedCandidate) => {
            digits.len() == 1
                && cells.len() >= 2
                && equal_cells(&candidate_positions(state, &unit.cells, digits[0]), cells)
                && removals.iter().all(|removal| {
                    removal.digit == digits[0]
                        && state.board.values()[removal.cell] == 0
                        && state.candidates[removal.cell].bits() & mask_of(removal.digit) != 0
                        && cells.iter().all(|cell| {
                            state.rules.context().duplicate_peers[removal.cell].contains(cell)
                        })
                })
        }
        (LogicalAction::Elimination { removals }, Technique::NakedPair | Technique::HiddenPair) => {
            if cells.len() != 2
                || digits.len() != 2
                || cells.iter().any(|&cell| state.board.values()[cell] != 0)
            {
                return false;
            }
            let pair = mask_of(digits[0]) | mask_of(digits[1]);
            let pattern_valid = if step.technique == Technique::NakedPair {
                cells
                    .iter()
                    .all(|&cell| state.candidates[cell].bits() == pair)
            } else {
                digits.iter().all(|&digit| {
                    equal_cells(&candidate_positions(state, &unit.cells, digit), cells)
                })
            };
            pattern_valid
                && removals.iter().all(|removal| {
                    unit.cells.contains(&removal.cell)
                        && state.board.values()[removal.cell] == 0
                        && state.candidates[removal.cell].bits() & mask_of(removal.digit) != 0
                        && if step.technique == Technique::NakedPair {
                            !cells.contains(&removal.cell) && pair & mask_of(removal.digit) != 0
                        } else {
                            cells.contains(&removal.cell) && pair & mask_of(removal.digit) == 0
                        }
                })
        }
        _ => false,
    }
}
