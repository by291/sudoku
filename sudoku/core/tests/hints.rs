#[path = "support/rules.rs"]
pub mod fixtures;
#[path = "support/hints.rs"]
mod hint_contracts;
#[path = "support/projection.rs"]
mod logical_projection;

use sudoku_core::budget::WorkBudget;
use sudoku_core::hint::{HintResult, HintUnavailable, analyze_hint};
use sudoku_core::logic::hint_validation::validate_hint_evidence;
use sudoku_core::logic::types::{Evidence, LogicalAction};
use sudoku_core::rules::context::compile_rules;
use sudoku_core::rules::types::PuzzleRules;
use sudoku_core::types::Board;

#[test]
fn matches_full_elimination_to_placement_hint_chain() {
    let rows: Vec<serde_json::Value> = serde_json::from_str(include_str!(
        "../../../tests/fixtures/engine-contracts/hints.json"
    ))
    .unwrap();
    for row in rows {
        let input = &row["input"];
        let values: Vec<u8> = serde_json::from_value(input["board"].clone()).unwrap();
        let solution: Vec<u8> = serde_json::from_value(input["solution"].clone()).unwrap();
        let board = Board::try_from(values.as_slice()).unwrap();
        let solution = Board::try_from(solution.as_slice()).unwrap();
        let rules = fixtures::decode_rules(&input["rules"]).unwrap();
        let prepared = compile_rules(&rules).unwrap();

        let hint = analyze_hint(
            &board,
            &solution,
            &prepared,
            500,
            &mut WorkBudget::new(4000000),
        );

        assert!(matches!(hint, HintResult::Deduction { .. }));
        let projected =
            hint_contracts::evaluate(serde_json::from_value(input.clone()).unwrap()).unwrap();
        assert_eq!(projected, row["expected"], "{}", row["id"]);
        assert_eq!(
            validate_hint_evidence(&hint, &rules, Some(&board)).unwrap(),
            hint
        );
    }
}

#[test]
fn reviews_first_incorrect_entry() {
    let board = Board::try_from([1; 81].as_slice()).unwrap();
    let solution = Board::try_from([2; 81].as_slice()).unwrap();
    let prepared = compile_rules(&PuzzleRules::Classic).unwrap();

    let hint = analyze_hint(&board, &solution, &prepared, 500, &mut WorkBudget::new(0));

    assert_eq!(hint, HintResult::ReviewEntry { cell: 0 });
}

#[test]
fn hint_exhaustion_is_not_an_unsupported_claim() {
    let prepared = compile_rules(&PuzzleRules::Classic).unwrap();

    assert_eq!(
        analyze_hint(
            &Board::EMPTY,
            &Board::EMPTY,
            &prepared,
            500,
            &mut WorkBudget::new(0)
        ),
        HintResult::Unavailable(HintUnavailable::BudgetExhausted)
    );
    assert_eq!(
        analyze_hint(
            &Board::EMPTY,
            &Board::EMPTY,
            &prepared,
            0,
            &mut WorkBudget::new(4000000)
        ),
        HintResult::Unavailable(HintUnavailable::BudgetExhausted)
    );
    assert_eq!(
        analyze_hint(
            &Board::EMPTY,
            &Board::EMPTY,
            &prepared,
            500,
            &mut WorkBudget::new(4000000)
        ),
        HintResult::Unavailable(HintUnavailable::Unsupported)
    );
}

#[test]
fn validates_owned_chains_and_rejects_changed_clues_and_conclusions() {
    let rows: Vec<serde_json::Value> = serde_json::from_str(include_str!(
        "../../../tests/fixtures/engine-contracts/hint-chains.json"
    ))
    .unwrap();
    let mut chains = 0;
    let mut rule_chains = 0;
    for row in rows {
        let input = &row["input"];
        let values: Vec<u8> = serde_json::from_value(input["board"].clone()).unwrap();
        let solution: Vec<u8> = serde_json::from_value(input["solution"].clone()).unwrap();
        let board = Board::try_from(values.as_slice()).unwrap();
        let solution = Board::try_from(solution.as_slice()).unwrap();
        let rules = fixtures::decode_rules(&input["rules"]).unwrap();
        let prepared = compile_rules(&rules).unwrap();
        let mut budget = WorkBudget::new(input["limit"].as_u64().unwrap());

        let hint = analyze_hint(
            &board,
            &solution,
            &prepared,
            input["maxSteps"].as_u64().unwrap() as u32,
            &mut budget,
        );

        let mut actual = hint_contracts::project(&hint);
        actual["workUsed"] = serde_json::json!(budget.used());
        assert_eq!(actual, row["expected"], "{}", row["id"]);
        let HintResult::Deduction { .. } = hint else {
            continue;
        };
        chains += 1;
        assert_eq!(
            validate_hint_evidence(&hint, &rules, Some(&board)).unwrap(),
            hint
        );
        let mut forged = hint.clone();
        if let HintResult::Deduction { steps, placement } = &mut forged {
            placement.digit = if placement.digit == 9 { 1 } else { 9 };
            steps.last_mut().unwrap().action = LogicalAction::Placement {
                cell: placement.cell,
                digit: placement.digit,
            };
        }
        assert!(validate_hint_evidence(&forged, &rules, Some(&board)).is_err());
        let mut forged = hint.clone();
        if let HintResult::Deduction { steps, .. } = &mut forged {
            let step = steps
                .iter_mut()
                .find(|step| matches!(step.evidence, Evidence::Rule(_)));
            if let Some(step) = step {
                rule_chains += 1;
                if let Evidence::Rule(evidence) = &mut step.evidence {
                    evidence.constraint_id.push_str(":forged");
                }
                assert!(validate_hint_evidence(&forged, &rules, Some(&board)).is_err());
            }
        }
    }
    assert!(chains > 0);
    assert!(rule_chains > 0);
}

#[test]
fn proof_validation_retains_the_original_transport_work_bound() {
    use sudoku_core::logic::hint_validation::HINT_VALIDATION_WORK_LIMIT;

    // The frozen transport validator uses DEFAULT_WORK_LIMIT, independently fixed at one million.
    assert_eq!(HINT_VALIDATION_WORK_LIMIT, 1000000);
}

#[test]
fn shape_only_hint_validation_does_not_require_a_layout_or_board() {
    use sudoku_core::hint::HintResult;
    use sudoku_core::logic::hint_validation::validate_hint_shape;

    assert_eq!(
        validate_hint_shape(&HintResult::ReviewEntry { cell: 80 }).unwrap(),
        HintResult::ReviewEntry { cell: 80 }
    );
    assert!(validate_hint_shape(&HintResult::ReviewEntry { cell: 81 }).is_err());
}
