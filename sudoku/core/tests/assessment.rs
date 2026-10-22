#[path = "support/assessment.rs"]
mod assessment_projection;
#[path = "support/rules.rs"]
pub mod fixtures;
#[path = "support/projection.rs"]
mod projection;

use sudoku_core::control::ExecutionControl;
use sudoku_core::rating::assessment::{prepare_assessment, prepare_assessment_with_computation};
use sudoku_core::rating::types::AssessmentLimits;
use sudoku_core::rating::types::{AssessmentResult, TrialAssessmentResult};
use sudoku_core::types::{Board, Bounded, Difficulty};

#[test]
fn policy_prefix_reuse_preserves_full_trace() {
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
        let mut control = ExecutionControl::new();

        let AssessmentResult::Rated(result) = owner.assess(&board, &mut control) else {
            panic!("Expected authored rating: {}", row["id"]);
        };

        assert_eq!(result.trace.len() as u64, result.summary.workload.steps);

        let expected = &row["expected"]["budgeted"];
        assert_eq!(
            assessment_projection::project_summary(&result.summary),
            expected["summary"],
            "summary {}",
            row["id"]
        );
        assert_eq!(
            serde_json::json!(
                result
                    .trace
                    .iter()
                    .map(projection::project_step)
                    .collect::<Vec<_>>()
            ),
            expected["trace"],
            "trace {}",
            row["id"]
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
    let mut setup = ExecutionControl::new();
    let Bounded::Complete(computation) =
        sudoku_core::constraints::computation::prepare_computation(&rules, &mut setup).unwrap()
    else {
        panic!("Expected preparation");
    };
    let owner =
        prepare_assessment_with_computation(&computation, AssessmentLimits::default()).unwrap();
    let mut control = ExecutionControl::new();

    let TrialAssessmentResult::Rated(trial) = owner.screen(&board, &mut control) else {
        panic!("Expected one-step trial");
    };

    let completed = trial.complete().unwrap();

    assert_eq!(completed.summary.difficulty, Difficulty::Easy);
    assert_eq!(completed.summary.workload.placements, 1);
    assert_eq!(completed.trace.len(), 1);

    assert!(matches!(
        owner.assess(&board, &mut control),
        AssessmentResult::Rated(_)
    ));
}

#[test]
fn borrowed_continuation_returns_an_independent_trace_snapshot() {
    use sudoku_core::logic::solver::analyze_workspace;
    use sudoku_core::logic::techniques::BASIC_TECHNIQUES;
    use sudoku_core::logic::types::{LogicStatus, LogicalAction};
    use sudoku_core::logic::workspace::create_workspace;
    use sudoku_core::rules::context::compile_rules;
    use sudoku_core::rules::types::PuzzleRules;

    let mut values: [u8; 81] =
        std::array::from_fn(|cell| ((cell / 9 * 3 + cell / 27 + cell % 9) % 9 + 1) as u8);
    values[0] = 0;
    values[40] = 0;
    let board = Board::try_from(values.as_slice()).unwrap();
    let rules = compile_rules(&PuzzleRules::Classic).unwrap();
    let mut state = create_workspace(&board, &rules);
    let mut control = ExecutionControl::new();
    let mut previous = analyze_workspace(&mut state, &BASIC_TECHNIQUES, 1, &mut control, &[]);
    assert_eq!(previous.status, LogicStatus::StepLimit);

    let resumed = analyze_workspace(
        &mut state,
        &BASIC_TECHNIQUES,
        2,
        &mut control,
        &previous.steps,
    );
    previous.steps[0].action = LogicalAction::Placement { cell: 0, digit: 9 };
    previous.steps.clear();

    assert_eq!(resumed.status, LogicStatus::Solved);
    assert_eq!(resumed.steps.len(), 2);
    assert_eq!(
        resumed.steps[0].action,
        LogicalAction::Placement { cell: 0, digit: 1 }
    );
    assert_eq!(state.board(), &resumed.board);
}
