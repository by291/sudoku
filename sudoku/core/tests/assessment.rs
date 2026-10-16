#[path = "support/rules.rs"]
pub mod fixtures;

use sudoku_core::budget::WorkBudget;
use sudoku_core::rating::assessment::{prepare_assessment, prepare_assessment_with_computation};
use sudoku_core::rating::types::AssessmentLimits;
use sudoku_core::rating::types::{AssessmentResult, TrialAssessmentResult};
use sudoku_core::types::{Board, Bounded, Difficulty};

#[test]
fn policy_prefix_reuse_preserves_full_trace_and_charges() {
    let rows: Vec<serde_json::Value> = serde_json::from_str(include_str!(
        "../../../tests/fixtures/engine-contracts/assessment.json"
    ))
    .unwrap();
    for row in rows {
        let input = &row["input"];
        let values: Vec<u8> = serde_json::from_value(input["board"].clone()).unwrap();
        let board = Board::try_from(values.as_slice()).unwrap();
        let rules = fixtures::decode_rules(&input["rules"]).unwrap();
        let owner = prepare_assessment(&rules, AssessmentLimits::default()).unwrap();
        let mut budget = WorkBudget::new(input["limit"].as_u64().unwrap());

        let AssessmentResult::Rated(result) = owner.assess(&board, &mut budget) else {
            panic!("Expected authored rating: {}", row["id"]);
        };

        assert_eq!(result.trace.len() as u64, result.summary.workload.steps);
        assert_eq!(budget.used(), row["expected"]["workUsed"].as_u64().unwrap());
        let expected = &row["expected"]["budgeted"]["summary"]["difficulty"];
        assert_eq!(
            result.summary.difficulty.as_str(),
            expected.as_str().unwrap()
        );
    }
}

#[test]
fn trial_completion_does_not_repeat_policy_search() {
    let values = std::array::from_fn::<_, 81, _>(|cell| {
        ((cell / 9 * 3 + cell / 27 + cell % 9) % 9 + 1) as u8
    });
    let mut clues = values;
    clues[40] = 0;
    let board = Board::try_from(clues.as_slice()).unwrap();
    let rules = sudoku_core::rules::types::PuzzleRules::Classic;
    let mut setup = WorkBudget::new(4000000);
    let Bounded::Complete(computation) =
        sudoku_core::constraints::computation::prepare_computation(&rules, &mut setup).unwrap()
    else {
        panic!("Expected preparation");
    };
    let owner =
        prepare_assessment_with_computation(&computation, AssessmentLimits::default()).unwrap();
    let mut budget = WorkBudget::new(1);

    let TrialAssessmentResult::Rated(trial) = owner.screen(&board, &mut budget) else {
        panic!("Expected one-step trial");
    };
    assert_eq!(budget.used(), 1);
    let completed = trial.complete().unwrap();

    assert_eq!(completed.summary.difficulty, Difficulty::Easy);
    assert_eq!(completed.summary.workload.placements, 1);
    assert_eq!(completed.trace.len(), 1);
    assert_eq!(budget.used(), 1);
    assert!(matches!(
        owner.assess(&board, &mut budget),
        AssessmentResult::Unrated(_)
    ));
}
