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
        .all(|constraint| crate::rules::context::satisfies_constraint(board, constraint))
}

/// Base candidates apply duplicate peers only; arithmetic refinement belongs to constraints.
pub fn base_candidates(board: &Board, prepared: &PreparedRules) -> [CandidateMask; BOARD_SIZE] {
    std::array::from_fn(|cell| {
        if board.values()[cell] != 0 {
            return CandidateMask::EMPTY;
        }
        let mut mask = CandidateMask::ALL;
        for &peer in &prepared.context().duplicate_peers[cell] {
            mask.exclude_board_value(board.values()[peer]);
        }
        mask
    })
}
