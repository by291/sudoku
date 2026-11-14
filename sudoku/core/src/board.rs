use crate::rules::evaluation::satisfies_constraint;
use crate::rules::types::PreparedRules;
use crate::types::{ALL_DIGITS_MASK, BOARD_SIZE, Board, CandidateMask, CoreResult, EngineError};

/// A complete assignment for one immutable prepared layout. This proves existence only.
pub(crate) struct KnownCompletion {
    board: Board,
    rules: PreparedRules,
}

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
    let units = &prepared.context().units;
    let groups = units.iter().map(|unit| unit.cells.as_slice());
    candidates_from_groups(board, groups)
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
    let entries = board.values().iter().enumerate();
    let solution = solution.values();

    entries
        .filter_map(|(cell, &value)| (value != 0 && value != solution[cell]).then_some(cell))
        .collect()
}

impl KnownCompletion {
    /// Own a terminal board and share its layout after validating the full assignment.
    pub(crate) fn new(board: &Board, rules: &PreparedRules) -> CoreResult<Self> {
        if !is_complete(board, rules) {
            return Err(EngineError::invalid(
                "Known completion does not satisfy the layout",
            ));
        }

        Ok(Self {
            board: board.clone(),
            rules: rules.clone(),
        })
    }

    /// Check layout identity and whether the terminal agrees with every given.
    pub(crate) fn covers(&self, board: &Board, rules: &PreparedRules) -> bool {
        let givens = board.values().iter();
        self.rules.same_layout(rules) && givens.zip(self.board.values()).all(matches_given)
    }

    pub(crate) fn board(&self) -> &Board {
        &self.board
    }
}

/// Test whether a terminal entry agrees with a given or fills an empty cell.
pub(crate) fn matches_given((&given, &terminal): (&u8, &u8)) -> bool {
    given == 0 || given == terminal
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rules::context::compile_rules;
    use crate::rules::types::PuzzleRules;

    #[test]
    fn completion_witness_rejects_invalid_terminals_mismatched_givens_and_other_layouts() {
        let rules = compile_rules(&PuzzleRules::Classic).unwrap();
        let values: [u8; 81] =
            std::array::from_fn(|cell| ((cell / 9 * 3 + cell / 27 + cell % 9) % 9 + 1) as u8);
        let terminal = Board::try_from(values.as_slice()).unwrap();
        let mut givens = values;
        givens[0] = 0;
        let partial = Board::try_from(givens.as_slice()).unwrap();
        let witness = KnownCompletion::new(&terminal, &rules).unwrap();

        assert!(witness.covers(&partial, &rules));
        assert!(KnownCompletion::new(&partial, &rules).is_err());
        givens[0] = 2;
        assert!(!witness.covers(&Board::try_from(givens.as_slice()).unwrap(), &rules));
        let other = compile_rules(&PuzzleRules::Classic).unwrap();
        assert!(!witness.covers(&partial, &other));
    }
}
