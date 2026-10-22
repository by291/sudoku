use crate::rules::evaluation::satisfies_constraint;
use crate::rules::types::PreparedRules;
use crate::types::{ALL_DIGITS_MASK, BOARD_SIZE, Board, CandidateMask};

/// Full-board completion is distinct from the feasibility of a partial arithmetic clue.
pub fn is_complete(board: &Board, prepared: &PreparedRules) -> bool {
    let values = board.values();
    if values.contains(&0) {
        return false;
    }

    let context = prepared.context();
    for unit in &context.units {
        let mask = unit
            .cells
            .iter()
            .fold(0_u16, |mask, &cell| mask | (1 << (values[cell] - 1)));
        if mask != ALL_DIGITS_MASK {
            return false;
        }
    }

    context
        .constraints
        .iter()
        .all(|constraint| satisfies_constraint(board, constraint))
}

/// Base candidates apply duplicate peers only; arithmetic refinement belongs to constraints.
pub fn base_candidates(board: &Board, prepared: &PreparedRules) -> [CandidateMask; BOARD_SIZE] {
    candidates_from_groups(board, prepared.duplicate_groups().iter().map(Vec::as_slice))
}

/// Logical Killer candidates exclude full-unit givens before cage deductions are explained.
pub(crate) fn unit_candidates(
    board: &Board,
    prepared: &PreparedRules,
) -> [CandidateMask; BOARD_SIZE] {
    candidates_from_groups(
        board,
        prepared
            .context()
            .units
            .iter()
            .map(|unit| unit.cells.as_slice()),
    )
}

fn candidates_from_groups<'a>(
    board: &Board,
    groups: impl Iterator<Item = &'a [usize]>,
) -> [CandidateMask; BOARD_SIZE] {
    let mut excluded = [0_u16; BOARD_SIZE];
    for cells in groups {
        // Zero contributes no bit; aggregate each group once instead of rescanning peers per cell.
        let digits = cells.iter().fold(0, |bits, &cell| {
            bits | ((1_u16 << board.values()[cell]) >> 1)
        });
        for &cell in cells {
            excluded[cell] |= digits;
        }
    }
    std::array::from_fn(|cell| {
        if board.values()[cell] == 0 {
            CandidateMask::from_computed_bits(ALL_DIGITS_MASK & !excluded[cell])
        } else {
            CandidateMask::EMPTY
        }
    })
}

/// Return nonempty entries that differ from an already validated solution; blanks are not errors.
pub fn incorrect_entries(board: &Board, solution: &Board) -> Vec<usize> {
    board
        .values()
        .iter()
        .enumerate()
        .filter_map(|(cell, &value)| {
            (value != 0 && value != solution.values()[cell]).then_some(cell)
        })
        .collect()
}
