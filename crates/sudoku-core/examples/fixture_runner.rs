//! Test-only JSONL adapter; the reusable library performs no I/O or platform work.
#[path = "contracts/constraints.rs"]
mod constraint_contracts;
#[path = "contracts/editing.rs"]
mod editing_contracts;
#[path = "../tests/support/rules.rs"]
pub mod fixtures;
#[path = "contracts/search.rs"]
mod search_contracts;

use serde::Deserialize;
use serde_json::{Value, json};
use std::io::{self, BufRead};
use sudoku_core::board::{base_candidates, is_complete};
use sudoku_core::random::{Seed, SeededRandom};
use sudoku_core::rules::context::compile_rules;
use sudoku_core::types::Board;

#[derive(Deserialize)]
#[serde(deny_unknown_fields, tag = "suite", content = "input")]
enum Request {
    #[serde(rename = "exact")]
    Exact(search_contracts::ExactInput),
    #[serde(rename = "exact-prepared")]
    ExactPrepared(search_contracts::PreparedInput),
    #[serde(rename = "editing")]
    Editing(editing_contracts::EditingInput),
    #[serde(rename = "constraints")]
    Constraints(constraint_contracts::ConstraintInput),
    #[serde(rename = "support")]
    Support(constraint_contracts::SupportInput),
    #[serde(rename = "random")]
    Random { seed: Vec<u8>, count: usize },
    #[serde(rename = "rules")]
    Rules { rules: Value, board: Vec<u8> },
}

fn evaluate(request: Request) -> Result<Value, Box<dyn std::error::Error>> {
    match request {
        Request::Exact(input) => search_contracts::evaluate(input),
        Request::ExactPrepared(input) => search_contracts::evaluate_prepared(input),
        Request::Editing(input) => editing_contracts::evaluate(input),
        Request::Constraints(input) => constraint_contracts::evaluate(input),
        Request::Support(input) => constraint_contracts::evaluate_support(input),
        Request::Random { seed, count } => {
            if count > 10000 {
                return Err("Fixture stream length exceeds 10000 words".into());
            }
            let seed = Seed::try_from(seed.as_slice())?;
            let mut random = SeededRandom::new(&seed);
            let words: Vec<u32> = (0..count).map(|_| random.next_u32()).collect();
            Ok(serde_json::to_value(words)?)
        }
        Request::Rules { rules, board } => {
            let board = Board::try_from(board.as_slice())?;
            let rules = fixtures::decode_rules(&rules)?;
            let prepared = compile_rules(&rules)?;
            let candidates: Vec<u16> = base_candidates(&board, &prepared)
                .iter()
                .map(|mask| mask.bits())
                .collect();
            Ok(
                json!({"context":fixtures::project_rules(&prepared),"candidates":candidates,"complete":is_complete(&board,&prepared),"workUsed":0}),
            )
        }
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    for line in io::stdin().lock().lines() {
        let request: Request = serde_json::from_str(&line?)?;
        let result = evaluate(request)?;
        println!("{}", serde_json::to_string(&result)?);
    }
    Ok(())
}
