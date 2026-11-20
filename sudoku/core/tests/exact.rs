#[path = "support/rules.rs"]
pub mod fixtures;

use serde_json::{Value, json};
use sudoku_core::constraints::computation::prepare_computation;
use sudoku_core::constraints::types::PreparedComputation;
use sudoku_core::control::ExecutionControl;
use sudoku_core::search::exact::{count_solutions, count_with_rules};
use sudoku_core::search::types::SearchResult;
use sudoku_core::types::{Board, Bounded};

const COMPLETE_NODE_LIMIT: u64 = 1_000_000;
const LEGACY_AMPLE_WORK_LIMIT: u64 = 4_000_000;
const ROOT_NODE_LIMIT: u64 = 1;
const EARLY_BRANCH_NODE_LIMIT: u64 = 2;
const ARITHMETIC_BRANCH_CASES: [&str; 3] = [
    "generated:killer-hard:0:0",
    "generated:thermo-medium:0:0",
    "authored:arrow-hard:0",
];

fn prepared_rows() -> Vec<Value> {
    serde_json::from_str(include_str!(
        "../../../tests/fixtures/engine-contracts/exact-prepared.json"
    ))
    .unwrap()
}

fn decode_board(input: &Value) -> Board {
    let values: Vec<u8> = serde_json::from_value(input["board"].clone()).unwrap();
    Board::try_from(values.as_slice()).unwrap()
}

fn prepare_fixture(input: &Value) -> PreparedComputation {
    let rules = fixtures::decode_rules(&input["rules"]).unwrap();
    let Bounded::Complete(prepared) =
        prepare_computation(&rules, &mut ExecutionControl::new()).unwrap()
    else {
        panic!("Expected immutable prepared layout");
    };
    prepared
}

fn project_result(result: SearchResult) -> Value {
    match result {
        SearchResult::Complete {
            count,
            solution,
            nodes_visited,
        } => json!({
            "status": "complete",
            "count": count,
            "solution": solution.map(|board| board.values().to_vec()),
            "nodesVisited": nodes_visited
        }),
        SearchResult::Incomplete { nodes_visited } => json!({
            "status": "budget-exhausted",
            "nodesVisited": nodes_visited
        }),
    }
}

fn assert_sealed_search_result(result: SearchResult, expected: &Value, id: &Value) {
    assert_eq!(
        project_result(result),
        fixtures::without_work(expected.clone()),
        "{id}"
    );
}

#[test]
fn standalone_search_preserves_counts_first_solution_and_node_limits() {
    let rows: Vec<Value> = serde_json::from_str(include_str!(
        "../../../tests/fixtures/engine-contracts/exact.json"
    ))
    .unwrap();

    // With ample legacy work, exhaustion comes from the node limit that the wrapper still forwards.
    let current_node_cases = rows
        .iter()
        .filter(|row| row["input"]["limit"] == LEGACY_AMPLE_WORK_LIMIT);
    for row in current_node_cases {
        let input = &row["input"];
        let rules = fixtures::decode_rules(&input["rules"]).unwrap();
        let board = decode_board(input);
        let node_limit = input["nodes"].as_u64().unwrap();

        let result =
            count_with_rules(&board, &rules, &mut ExecutionControl::new(), node_limit).unwrap();

        assert_sealed_search_result(result, &row["expected"], &row["id"]);
    }
}

#[test]
fn prepared_search_matches_sealed_complete_counts_and_solutions() {
    let rows = prepared_rows();
    let complete_rows = rows.iter().filter(|row| {
        row["input"]["nodeLimit"] == COMPLETE_NODE_LIMIT
            && row["expected"]["result"]["status"] == "complete"
    });

    for row in complete_rows {
        let input = &row["input"];
        let board = decode_board(input);
        let prepared = prepare_fixture(input);

        let result = count_solutions(
            &board,
            &prepared,
            &mut ExecutionControl::new(),
            COMPLETE_NODE_LIMIT,
        );

        assert_sealed_search_result(result, &row["expected"]["result"], &row["id"]);
    }
}

#[test]
fn prepared_node_budget_distinguishes_exhaustion_from_early_completion() {
    let rows = prepared_rows();
    let bounded_rows = rows
        .iter()
        .filter(|row| row["input"]["nodeLimit"].as_u64().unwrap() <= ROOT_NODE_LIMIT);

    // With room for at most one node, direct contradictions and root propagation can still finish.
    for row in bounded_rows {
        let input = &row["input"];
        let node_limit = input["nodeLimit"].as_u64().unwrap();
        let board = decode_board(input);
        let prepared = prepare_fixture(input);

        let result = count_solutions(&board, &prepared, &mut ExecutionControl::new(), node_limit);

        assert_sealed_search_result(result, &row["expected"]["result"], &row["id"]);
    }
}

#[test]
fn prepared_search_reaches_sealed_solution_after_branch_exhaustion() {
    let rows = prepared_rows();

    for id in ARITHMETIC_BRANCH_CASES {
        let row = rows.iter().find(|row| row["id"] == id).unwrap();
        let input = &row["input"];
        let board = decode_board(input);
        let prepared = prepare_fixture(input);

        // These cases have sibling branches, so cutting off after two visits interrupts the search.
        let incomplete = count_solutions(
            &board,
            &prepared,
            &mut ExecutionControl::new(),
            EARLY_BRANCH_NODE_LIMIT,
        );
        assert_eq!(
            incomplete,
            SearchResult::Incomplete {
                nodes_visited: EARLY_BRANCH_NODE_LIMIT,
            },
            "{id}"
        );

        // Each retry searches the original board again and must complete with the sealed result.
        for _ in 0..2 {
            let completed = count_solutions(
                &board,
                &prepared,
                &mut ExecutionControl::new(),
                COMPLETE_NODE_LIMIT,
            );

            assert_sealed_search_result(completed, &row["expected"]["result"], &row["id"]);
        }
    }
}

#[test]
fn standalone_validation_precedes_contradiction_and_preparation() {
    use sudoku_core::rules::types::PuzzleRules;
    let mut values = [0_u8; 81];
    values[0] = 1;
    values[1] = 1;
    let duplicate = Board::try_from(values.as_slice()).unwrap();
    let invalid_rules = PuzzleRules::Thermo {
        paths: vec![vec![0, 80]],
    };
    let mut control = ExecutionControl::new();

    assert!(count_with_rules(&duplicate, &invalid_rules, &mut control, 100).is_err());
    assert_eq!(
        count_with_rules(&duplicate, &PuzzleRules::Diagonal, &mut control, 100).unwrap(),
        SearchResult::Complete {
            count: 0,
            solution: None,
            nodes_visited: 0,
        }
    );

    assert_eq!(
        count_with_rules(
            &Board::EMPTY,
            &PuzzleRules::Diagonal,
            &mut fixtures::cancelled_control(),
            100
        )
        .unwrap(),
        SearchResult::Incomplete { nodes_visited: 0 }
    );
}

#[test]
fn completed_invalid_arithmetic_is_rejected_without_search() {
    use sudoku_core::rules::types::{Arrow, PuzzleRules};
    let values: [u8; 81] =
        std::array::from_fn(|cell| ((cell / 9 * 3 + cell / 27 + cell % 9) % 9 + 1) as u8);
    let board = Board::try_from(values.as_slice()).unwrap();
    let rules = PuzzleRules::Arrow {
        arrows: vec![Arrow {
            circle: 0,
            shaft: vec![1],
        }],
    };
    let mut control = ExecutionControl::new();

    // The completed Classic board has 1 in the circle and 2 on its shaft.
    assert_eq!(
        count_with_rules(&board, &rules, &mut control, 100).unwrap(),
        SearchResult::Complete {
            count: 0,
            solution: None,
            nodes_visited: 0,
        }
    );
}
