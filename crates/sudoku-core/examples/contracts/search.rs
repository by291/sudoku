use crate::fixtures::decode_rules;
use serde::Deserialize;
use serde_json::{Value, json};
use sudoku_core::budget::WorkBudget;
use sudoku_core::constraints::computation::prepare_computation;
use sudoku_core::search::exact::{count_solutions, count_with_rules};
use sudoku_core::search::types::SearchResult;
use sudoku_core::types::{Board, Bounded};

type FixtureResult = Result<Value, Box<dyn std::error::Error>>;
const SETUP_WORK_LIMIT: u64 = 4000000;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ExactInput {
    board: Vec<u8>,
    rules: Value,
    limit: u64,
    nodes: u64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct PreparedInput {
    board: Vec<u8>,
    rules: Value,
    work_limit: u64,
    node_limit: u64,
    initial_work: u64,
}

pub fn project(result: SearchResult) -> Value {
    match result {
        SearchResult::Complete {
            count,
            solution,
            nodes_visited,
            work_used,
        } => {
            json!({"status":"complete","count":count,"solution":solution.map(|board|board.values().to_vec()),"nodesVisited":nodes_visited,"workUsed":work_used})
        }
        SearchResult::BudgetExhausted {
            nodes_visited,
            work_used,
        } => json!({"status":"budget-exhausted","nodesVisited":nodes_visited,"workUsed":work_used}),
    }
}

pub fn evaluate(input: ExactInput) -> FixtureResult {
    let board = Board::try_from(input.board.as_slice())?;
    let rules = decode_rules(&input.rules)?;
    let mut budget = WorkBudget::new(input.limit);
    Ok(project(count_with_rules(
        &board,
        &rules,
        &mut budget,
        input.nodes,
    )?))
}

pub fn evaluate_prepared(input: PreparedInput) -> FixtureResult {
    let board = Board::try_from(input.board.as_slice())?;
    let rules = decode_rules(&input.rules)?;
    let mut setup = WorkBudget::new(SETUP_WORK_LIMIT);
    let Bounded::Complete(prepared) = prepare_computation(&rules, &mut setup)? else {
        return Err("Expected complete prepared fixture layout".into());
    };
    let mut budget = WorkBudget::new(input.work_limit);
    if !budget.consume(input.initial_work) {
        return Err("Invalid pre-consumed fixture allowance".into());
    }
    let result = count_solutions(&board, &prepared, &mut budget, input.node_limit);
    Ok(json!({"result":project(result),"used":budget.used()}))
}
