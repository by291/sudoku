#[path = "support/rules.rs"]
pub mod fixtures;

use sudoku_core::budget::WorkBudget;
use sudoku_core::constraints::candidates::evaluate_candidates;
use sudoku_core::constraints::conflicts::evaluate_conflicts;
use sudoku_core::constraints::types::{CandidateResult, ConflictStatus};
use sudoku_core::rules::context::compile_rules;
use sudoku_core::rules::types::PuzzleRules;
use sudoku_core::types::Board;

#[test]
fn partial_conflicts_remain_marked_incomplete() {
    let prepared = compile_rules(&PuzzleRules::Thermo {
        paths: vec![vec![0, 10, 20]],
    })
    .unwrap();
    let mut values = [0_u8; 81];
    values[1] = 1;
    values[2] = 1;
    let board = Board::try_from(values.as_slice()).unwrap();
    let mut budget = WorkBudget::new(0);

    let result = evaluate_conflicts(&board, &prepared, &mut budget);

    assert_eq!(result.status, ConflictStatus::BudgetExhausted);
    assert!(!result.violations.is_empty());
    assert_eq!(result.violations[0].constraint_id, "row:0");
}

#[test]
fn prepared_geometry_cannot_be_mutated_by_results() {
    let prepared = compile_rules(&PuzzleRules::Thermo {
        paths: vec![vec![0, 10, 20]],
    })
    .unwrap();
    let board = Board::try_from([0_u8; 81].as_slice()).unwrap();
    let mut budget = WorkBudget::new(100000);
    let CandidateResult::Complete(mut candidates) =
        evaluate_candidates(&board, &prepared, &mut budget)
    else {
        panic!("Expected candidates");
    };
    candidates.fill(sudoku_core::types::CandidateMask::EMPTY);
    let mut repeated = WorkBudget::new(100000);

    let CandidateResult::Complete(next) = evaluate_candidates(&board, &prepared, &mut repeated)
    else {
        panic!("Expected candidates");
    };

    // A three-cell increasing path independently permits 1..7, 2..8 and 3..9.
    assert_eq!(
        [next[0].bits(), next[10].bits(), next[20].bits()],
        [127, 254, 508]
    );
    assert_eq!(budget.used(), repeated.used());
}
