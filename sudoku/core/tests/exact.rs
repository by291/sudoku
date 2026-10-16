#[path = "support/rules.rs"]
pub mod fixtures;

use sudoku_core::budget::WorkBudget;
use sudoku_core::constraints::computation::prepare_computation;
use sudoku_core::search::exact::{count_solutions, count_with_rules};
use sudoku_core::search::types::SearchResult;
use sudoku_core::types::{Board, Bounded};

#[test]
fn counts_zero_one_two_and_preserves_first_solution() {
    let rows: Vec<serde_json::Value> = serde_json::from_str(include_str!(
        "../../../tests/fixtures/engine-contracts/exact.json"
    ))
    .unwrap();
    for row in rows {
        let input = &row["input"];
        let rules = fixtures::decode_rules(&input["rules"]).unwrap();
        let values: Vec<u8> = serde_json::from_value(input["board"].clone()).unwrap();
        let board = Board::try_from(values.as_slice()).unwrap();
        let mut budget = WorkBudget::new(input["limit"].as_u64().unwrap());

        let result = count_with_rules(
            &board,
            &rules,
            &mut budget,
            input["nodes"].as_u64().unwrap(),
        )
        .unwrap();

        assert_eq!(project_result(result), row["expected"], "{}", row["id"]);
    }
}

#[test]
fn insertion_order_preserves_work_and_nodes() {
    compare_prepared(false);
}

#[test]
fn late_exhaustion_restores_every_branch() {
    compare_prepared(true);
}

fn compare_prepared(repeat_after_exhaustion: bool) {
    let rows: Vec<serde_json::Value> = serde_json::from_str(include_str!(
        "../../../tests/fixtures/engine-contracts/exact-prepared.json"
    ))
    .unwrap();
    for row in rows {
        let input = &row["input"];
        let rules = fixtures::decode_rules(&input["rules"]).unwrap();
        let values: Vec<u8> = serde_json::from_value(input["board"].clone()).unwrap();
        let board = Board::try_from(values.as_slice()).unwrap();
        let mut setup = WorkBudget::new(4000000);
        let Bounded::Complete(prepared) = prepare_computation(&rules, &mut setup).unwrap() else {
            panic!("Expected immutable prepared layout");
        };
        let mut budget = WorkBudget::new(input["workLimit"].as_u64().unwrap());
        assert!(budget.consume(input["initialWork"].as_u64().unwrap()));

        let result = count_solutions(
            &board,
            &prepared,
            &mut budget,
            input["nodeLimit"].as_u64().unwrap(),
        );

        assert_eq!(
            serde_json::json!({"result":project_result(result),"used":budget.used()}),
            row["expected"],
            "{}",
            row["id"]
        );
        if repeat_after_exhaustion {
            let mut first = WorkBudget::new(4000000);
            let mut second = WorkBudget::new(4000000);
            assert_eq!(
                count_solutions(&board, &prepared, &mut first, 1000000),
                count_solutions(&board, &prepared, &mut second, 1000000)
            );
        }
    }
}

fn project_result(result: SearchResult) -> serde_json::Value {
    match result {
        SearchResult::Complete {
            count,
            solution,
            nodes_visited,
            work_used,
        } => {
            serde_json::json!({"status":"complete","count":count,"solution":solution.map(|board|board.values().to_vec()),"nodesVisited":nodes_visited,"workUsed":work_used})
        }
        SearchResult::BudgetExhausted {
            nodes_visited,
            work_used,
        } => {
            serde_json::json!({"status":"budget-exhausted","nodesVisited":nodes_visited,"workUsed":work_used})
        }
    }
}

#[test]
fn standalone_validation_precedes_free_contradiction_and_charged_preparation() {
    use sudoku_core::rules::types::PuzzleRules;
    let mut values = [0_u8; 81];
    values[0] = 1;
    values[1] = 1;
    let duplicate = Board::try_from(values.as_slice()).unwrap();
    let invalid_rules = PuzzleRules::Thermo {
        paths: vec![vec![0, 80]],
    };
    let mut budget = WorkBudget::new(0);

    assert!(count_with_rules(&duplicate, &invalid_rules, &mut budget, 100).is_err());
    assert_eq!(
        count_with_rules(&duplicate, &PuzzleRules::Diagonal, &mut budget, 100).unwrap(),
        SearchResult::Complete {
            count: 0,
            solution: None,
            nodes_visited: 0,
            work_used: 0
        }
    );
    assert_eq!(budget.used(), 0);
    assert_eq!(
        count_with_rules(&Board::EMPTY, &PuzzleRules::Diagonal, &mut budget, 100).unwrap(),
        SearchResult::BudgetExhausted {
            nodes_visited: 0,
            work_used: 0
        }
    );
}

#[test]
fn completed_invalid_arithmetic_retains_zero_budget_rejection() {
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
    let mut budget = WorkBudget::new(0);

    // The completed Classic board has 1 in the circle and 2 on its shaft.
    assert_eq!(
        count_with_rules(&board, &rules, &mut budget, 100).unwrap(),
        SearchResult::Complete {
            count: 0,
            solution: None,
            nodes_visited: 0,
            work_used: 0
        }
    );
    assert_eq!(budget.used(), 0);
}

#[test]
fn contradictory_arithmetic_siblings_discard_pending_propagation() {
    let rows: Vec<serde_json::Value> = serde_json::from_str(include_str!(
        "../../../tests/fixtures/engine-contracts/exact-prepared.json"
    ))
    .unwrap();
    let cases = [
        ("generated:killer-hard:0:0", 3, 15444),
        ("generated:thermo-medium:0:0", 7, 793),
        ("authored:arrow-hard:0", 7, 596),
    ];

    for (id, nodes_visited, work_used) in cases {
        let row = rows.iter().find(|row| row["id"] == id).unwrap();
        let input = &row["input"];
        let rules = fixtures::decode_rules(&input["rules"]).unwrap();
        let values: Vec<u8> = serde_json::from_value(input["board"].clone()).unwrap();
        let board = Board::try_from(values.as_slice()).unwrap();
        let expected_values: Vec<u8> =
            serde_json::from_value(row["expected"]["result"]["solution"].clone()).unwrap();
        let expected_solution = Board::try_from(expected_values.as_slice()).unwrap();
        let mut preparation = WorkBudget::new(4_000_000);
        let Bounded::Complete(computation) = prepare_computation(&rules, &mut preparation).unwrap()
        else {
            panic!("Expected immutable arithmetic layout");
        };
        let mut budget = WorkBudget::new(4_000_000);

        let result = count_solutions(&board, &computation, &mut budget, 1_000_000);

        // Sealed independent fixtures pin unique solutions after failed sibling branches, including queue work.
        assert_eq!(
            result,
            SearchResult::Complete {
                count: 1,
                solution: Some(expected_solution),
                nodes_visited,
                work_used,
            },
            "{id}"
        );
        assert_eq!(budget.used(), work_used, "{id}");
    }
}
