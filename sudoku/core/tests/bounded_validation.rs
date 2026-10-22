#[path = "support/rules.rs"]
pub mod fixtures;

use sudoku_core::control::ExecutionControl;
use sudoku_core::puzzle::{Puzzle, validate_puzzle_bounded};
use sudoku_core::types::{Board, Bounded, Difficulty};

#[test]
fn inconclusive_stored_content_validation_is_never_reported_as_corruption() {
    let geometry: serde_json::Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/engine-contracts/geometry.json"
    ))
    .unwrap();
    let values: Vec<u8> = serde_json::from_value(geometry["thermo"]["solution"].clone()).unwrap();
    let solution = Board::try_from(values.as_slice()).unwrap();
    let puzzle = Puzzle {
        givens: solution.clone(),
        solution,
        rules: fixtures::decode_rules(&geometry["thermo"]["rules"]).unwrap(),
        difficulty: Difficulty::Easy,
    };
    let mut measured = ExecutionControl::new();

    assert_eq!(
        validate_puzzle_bounded(&puzzle, &mut measured).unwrap(),
        Bounded::Complete(())
    );

    assert_eq!(
        validate_puzzle_bounded(&puzzle, &mut fixtures::cancelled_control()).unwrap(),
        Bounded::Cancelled
    );
}
