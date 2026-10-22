#[path = "support/assessment.rs"]
mod assessment_projection;
#[path = "support/rules.rs"]
pub mod fixtures;
#[path = "support/generation.rs"]
mod generation_projection;

use serde_json::Value;
use sudoku_core::board::is_complete;
use sudoku_core::control::ExecutionControl;
use sudoku_core::generation::generate::generate_puzzle;
use sudoku_core::generation::types::{
    GenerationExhaustionCause, GenerationInput, GenerationLimits, GenerationOutcome,
};
use sudoku_core::logic::types::LogicalAction;
use sudoku_core::puzzle::validate_puzzle;
use sudoku_core::random::Seed;
use sudoku_core::rating::assessment::assess_puzzle;
use sudoku_core::rating::input::create_assessment_input;
use sudoku_core::rating::types::{AssessmentLimits, AssessmentResult};
use sudoku_core::rules::context::compile_rules;
use sudoku_core::rules::types::{PuzzleRules, SudokuVariant};
use sudoku_core::search::exact::count_with_rules;
use sudoku_core::search::types::SearchResult;
use sudoku_core::types::Difficulty;

#[test]
fn layout_limit_does_not_discard_existing_frontiers() {
    let input = GenerationInput::new(
        SudokuVariant::Classic,
        Difficulty::Easy,
        Seed::from_bytes([0; 32]),
    )
    .unwrap();
    let limits = GenerationLimits {
        max_layouts: 1,
        ..GenerationLimits::default()
    };

    let result = generate_puzzle(&input, &limits).unwrap();

    assert!(matches!(result.outcome, GenerationOutcome::Ready { .. }));
    assert_eq!(result.metrics.layouts, 1);
    assert_eq!(result.metrics.completed_layouts, 1);
    assert!(result.metrics.candidate_visits >= 45);
}

#[test]
fn layout_exhaustion_never_exposes_partial_puzzles() {
    let input = GenerationInput::new(
        SudokuVariant::Classic,
        Difficulty::Hard,
        Seed::from_bytes([0; 32]),
    )
    .unwrap();
    let limits = GenerationLimits {
        max_layouts: 0,
        ..GenerationLimits::default()
    };
    let result = generate_puzzle(&input, &limits).unwrap();
    assert!(matches!(
        result.outcome,
        GenerationOutcome::Incomplete {
            cause: GenerationExhaustionCause::LayoutLimit
        }
    ));
}

fn regression_rows() -> Vec<Value> {
    serde_json::from_str(include_str!(
        "../../../tests/fixtures/engine-contracts/generation.json"
    ))
    .unwrap()
}

fn fixture_request(row: &Value) -> (GenerationInput, GenerationLimits) {
    let input = &row["input"];
    let variant = match input["variant"].as_str().unwrap() {
        "classic" => SudokuVariant::Classic,
        "diagonal" => SudokuVariant::Diagonal,
        "jigsaw" => SudokuVariant::Jigsaw,
        "killer" => SudokuVariant::Killer,
        "thermo" => SudokuVariant::Thermo,
        "arrow" => SudokuVariant::Arrow,
        _ => panic!("Unknown fixture variant"),
    };
    let difficulty = Difficulty::ALL
        .into_iter()
        .find(|difficulty| difficulty.as_str() == input["difficulty"].as_str().unwrap())
        .unwrap();
    let seed: [u8; 32] = serde_json::from_value(input["seed"].clone()).unwrap();
    let request = GenerationInput::new(variant, difficulty, Seed::from_bytes(seed)).unwrap();
    let limits = input
        .get("limits")
        .map_or_else(GenerationLimits::default, |limits| GenerationLimits {
            max_layouts: serde_json::from_value(limits["maxLayouts"].clone()).unwrap(),
            max_steps: serde_json::from_value(limits["maxSteps"].clone()).unwrap(),
        });

    (request, limits)
}

#[test]
fn sealed_historical_puzzles_remain_valid_independent_math_fixtures() {
    for row in regression_rows()
        .into_iter()
        .filter(|row| row["expected"]["status"] == "ready")
    {
        let puzzle = fixtures::decode_puzzle(&row["expected"]["puzzle"]).unwrap();
        assert!(validate_puzzle(&puzzle).is_ok(), "{}", row["id"]);
        let result = count_with_rules(
            &puzzle.givens,
            &puzzle.rules,
            &mut ExecutionControl::new(),
            u64::MAX,
        )
        .unwrap();
        assert!(
            matches!(result, SearchResult::Complete { count: 1, solution: Some(solution), .. } if solution == puzzle.solution),
            "{}",
            row["id"]
        );
    }
}

#[test]
fn every_supported_variant_and_tier_delivers_unique_matching_puzzles() {
    let mut covered = std::collections::BTreeSet::new();

    for row in regression_rows()
        .into_iter()
        .filter(|row| row["input"].get("limits").is_none())
    {
        let (input, limits) = fixture_request(&row);
        let result = generate_puzzle(&input, &limits).unwrap();
        let repeated = generate_puzzle(&input, &limits).unwrap();
        assert_eq!(
            generation_projection::project_result(&result),
            generation_projection::project_result(&repeated),
            "{}",
            row["id"]
        );
        let GenerationOutcome::Ready { puzzle, assessment } = result.outcome else {
            panic!("Expected delivery for {}", row["id"]);
        };
        let content = &puzzle.content;
        let expected = content;

        assert!(validate_puzzle(content).is_ok());
        assert_eq!(assessment.difficulty, input.difficulty());
        assert_eq!(assessment.variant, input.variant());
        let mut control = ExecutionControl::new();
        let counted =
            count_with_rules(&content.givens, &content.rules, &mut control, u64::MAX).unwrap();
        assert!(
            matches!(counted, SearchResult::Complete { count: 1, solution: Some(solution), .. } if solution == expected.solution),
            "{}",
            row["id"]
        );

        if input.variant() != SudokuVariant::Classic {
            let classic = compile_rules(&PuzzleRules::Classic).unwrap();
            // A terminal that violates Classic already establishes regional necessity.
            if is_complete(&expected.solution, &classic) {
                let mut control = ExecutionControl::new();
                let classic_count = count_with_rules(
                    &content.givens,
                    &PuzzleRules::Classic,
                    &mut control,
                    u64::MAX,
                )
                .unwrap();
                assert!(
                    matches!(classic_count, SearchResult::Complete { count: 2, .. }),
                    "{}",
                    row["id"]
                );
            }
        }

        let request =
            create_assessment_input(&content.givens, &content.rules, AssessmentLimits::default());
        let AssessmentResult::Rated(rated) = assess_puzzle(&request) else {
            panic!("Expected standalone assessment for {}", row["id"]);
        };
        assert_eq!(rated.summary, *assessment);
        for step in rated.trace {
            // The exact counter independently checks every generated terminal before trace validation.
            match step.action {
                LogicalAction::Placement { cell, digit } => {
                    assert_eq!(digit, expected.solution.values()[cell])
                }
                LogicalAction::Elimination { removals } => {
                    for removal in removals {
                        assert_ne!(removal.digit, expected.solution.values()[removal.cell]);
                    }
                }
            }
        }
        covered.insert((input.variant().as_str(), input.difficulty().as_str()));
    }

    assert_eq!(covered.len(), 19);
}

#[test]
fn all_supported_requests_exhaust_explicitly_at_each_limit() {
    let mut covered = std::collections::BTreeSet::new();

    for row in regression_rows()
        .into_iter()
        .filter(|row| row["input"].get("limits").is_none())
    {
        let (input, defaults) = fixture_request(&row);
        if !covered.insert((input.variant().as_str(), input.difficulty().as_str())) {
            continue;
        }

        let cases = [
            (
                GenerationLimits {
                    max_layouts: 0,
                    ..defaults
                },
                GenerationExhaustionCause::LayoutLimit,
            ),
            (
                GenerationLimits {
                    max_layouts: 1,
                    max_steps: 0,
                },
                GenerationExhaustionCause::LogicalStepLimit,
            ),
        ];

        for (limits, expected_cause) in cases {
            let result = generate_puzzle(&input, &limits).unwrap();
            let repeated = generate_puzzle(&input, &limits).unwrap();

            assert!(
                matches!(result.outcome, GenerationOutcome::Incomplete { cause } if cause == expected_cause),
                "{}: {:?}",
                row["id"],
                result.outcome
            );
            assert_eq!(
                generation_projection::project_result(&result),
                generation_projection::project_result(&repeated)
            );

            assert!(result.metrics.layouts <= limits.max_layouts);
        }
    }

    assert_eq!(covered.len(), 19);
}
