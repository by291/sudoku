use crate::rules::types::{PreparedRules, RuleConstraint};
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
    for constraint in &context.constraints {
        match constraint {
            RuleConstraint::Thermo { cells, .. } => {
                if !cells
                    .windows(2)
                    .all(|pair| values[pair[0]] < values[pair[1]])
                {
                    return false;
                }
            }
            RuleConstraint::Arrow { cells, .. } => {
                let total: u16 = cells[1..].iter().map(|&cell| u16::from(values[cell])).sum();
                if total != u16::from(values[cells[0]]) {
                    return false;
                }
            }
            RuleConstraint::Cage { cells, sum, .. } => {
                let mut seen = 0_u16;
                let mut total = 0_u16;
                for &cell in cells {
                    let bit = 1 << (values[cell] - 1);
                    if seen & bit != 0 {
                        return false;
                    }
                    seen |= bit;
                    total += u16::from(values[cell]);
                }
                if total != *sum {
                    return false;
                }
            }
        }
    }
    true
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
