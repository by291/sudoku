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
