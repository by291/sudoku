#[path = "support/rules.rs"]
pub mod fixtures;

use sudoku_core::puzzle::validate_puzzle;

#[test]
fn puzzle_content_validation_does_not_require_generation_metadata() {
    let rows: Vec<serde_json::Value> = serde_json::from_str(include_str!(
        "../../../tests/fixtures/engine-contracts/validation.json"
    ))
    .unwrap();

    for row in rows {
        let puzzle = fixtures::decode_puzzle(&row["input"]["puzzle"]).unwrap();
        let valid = validate_puzzle(&puzzle).is_ok();

        assert_eq!(
            serde_json::json!(valid),
            row["expected"]["valid"],
            "{}",
            row["id"]
        );
    }
}
