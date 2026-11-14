use std::sync::Arc;
use sudoku_core::constraints::conflicts::evaluate_conflicts;
use sudoku_core::control::ExecutionControl;
use sudoku_core::rules::context::compile_rules;
use sudoku_core::rules::types::PuzzleRules;
use sudoku_core::types::Board;
use sudoku_ffi::*;

fn token() -> Arc<CancellationToken> {
    Arc::new(CancellationToken::new())
}

#[test]
fn prepared_killer_conflicts_preserve_raw_violation_order() {
    let fixtures: Vec<serde_json::Value> = serde_json::from_str(include_str!(
        "../../../tests/fixtures/engine-contracts/rules.json"
    ))
    .unwrap();
    let fixture = fixtures
        .iter()
        .find(|row| row["id"] == "killer-easy")
        .unwrap();
    let rules: RulesDto = serde_json::from_value(fixture["input"]["rules"].clone()).unwrap();
    let core_rules = PuzzleRules::try_from(rules.clone()).unwrap();
    let raw_layout = compile_rules(&core_rules).unwrap();
    let prepared = prepare_puzzle(PrepareInputDto { rules }, token()).unwrap();
    let givens: Vec<u8> = serde_json::from_value(fixture["input"]["board"].clone()).unwrap();
    let mut conflicting = givens.clone();
    conflicting[0] = 9;
    conflicting[1] = 9;

    // Compare both clean and conflicting partial boards over the same cage layout.
    for values in [givens, conflicting] {
        let board = Board::try_from(values.as_slice()).unwrap();
        let expected = evaluate_conflicts(&board, &raw_layout, &mut ExecutionControl::new());
        let actual = prepared
            .conflicts(
                BoardQueryDto {
                    board: BoardDto(values),
                },
                token(),
            )
            .unwrap();

        let ConflictResultDto::Complete { violations } = actual.result else {
            panic!("Expected complete conflict evaluation");
        };
        let actual: Vec<_> = violations
            .iter()
            .map(|violation| (violation.constraint_id.as_str(), violation.cells.clone()))
            .collect();
        let expected: Vec<_> = expected
            .violations
            .iter()
            .map(|violation| {
                let cells: Vec<_> = violation
                    .cells
                    .iter()
                    .map(|&cell| u32::try_from(cell).unwrap())
                    .collect();
                (violation.constraint_id.as_str(), cells)
            })
            .collect();
        assert_eq!(actual, expected);
    }
}

#[test]
fn all_nineteen_combinations_reuse_the_sealed_independent_generation_evidence() {
    // These literal expectations were copied from the existing sealed TypeScript oracle corpus.
    // Adapter equality reuses that independent evidence; it is not a new mathematical proof.
    let corpus: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/generation-parity.json")).unwrap();
    let cases = corpus["cases"].as_array().unwrap();
    assert_eq!(cases.len(), 19);
    for row in cases {
        let mut options = row["input"].clone();
        let seed = serde_json::from_value(options.as_object_mut().unwrap().remove("seed").unwrap())
            .unwrap();
        options["puzzleVersion"] = serde_json::Value::String(
            options["puzzleVersion"]
                .as_str()
                .unwrap()
                .replace("v11", "v12"),
        );
        let options: GenerationOptionsDto = serde_json::from_value(options).unwrap();
        let result = generate(seed, options, token()).unwrap();
        // Historical mathematical evidence covers the puzzle and assessment. Scheduler
        // metrics change when v12 removes retries caused by local work allowances.
        let mut expected = row["expected"].clone();
        expected["puzzle"]["puzzleVersion"] = serde_json::Value::String(
            expected["puzzle"]["puzzleVersion"]
                .as_str()
                .unwrap()
                .replace("v11", "v12"),
        );
        expected.as_object_mut().unwrap().remove("metrics");
        let mut actual = serde_json::to_value(result).unwrap();
        actual.as_object_mut().unwrap().remove("metrics");
        assert_eq!(actual, expected, "{}", row["id"]);
    }
}

#[test]
fn exact_search_retains_independent_counts_and_node_limits() {
    let rows: Vec<serde_json::Value> = serde_json::from_str(include_str!(
        "../../../tests/fixtures/engine-contracts/exact-prepared.json"
    ))
    .unwrap();
    for row in rows {
        let input = &row["input"];
        // Historical counter-exhaustion cases are outside v12's time-control contract.
        // Retain independent complete results and explicit node-bound outcomes.
        if input["workLimit"] != 4_000_000 {
            continue;
        }
        let rules = serde_json::from_value(input["rules"].clone()).unwrap();
        let prepared = prepare_puzzle(PrepareInputDto { rules }, token()).unwrap();
        let result = prepared
            .count_solutions(
                PreparedCountInputDto {
                    board: serde_json::from_value(input["board"].clone()).unwrap(),
                    options: Some(SearchOptionsDto {
                        node_limit: Some(input["nodeLimit"].as_u64().unwrap() as u32),
                    }),
                },
                token(),
            )
            .unwrap();
        let mut expected = row["expected"]["result"].clone();
        expected.as_object_mut().unwrap().remove("workUsed");
        if expected["status"] == "budget-exhausted" {
            expected["status"] = "incomplete".into();
        }
        assert_eq!(
            serde_json::to_value(result.result).unwrap(),
            expected,
            "{}",
            row["id"]
        );
    }
}
