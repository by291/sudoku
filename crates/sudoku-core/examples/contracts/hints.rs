use crate::fixtures::decode_rules;
use crate::logical_projection::project_step;
use serde::Deserialize;
use serde_json::{Value, json};
use sudoku_core::budget::WorkBudget;
use sudoku_core::hint::{HintResult, HintUnavailable, analyze_hint};
use sudoku_core::rules::context::compile_rules;
use sudoku_core::types::Board;

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct HintInput {
    board: Vec<u8>,
    solution: Vec<u8>,
    rules: Value,
    limit: u64,
    #[serde(rename = "difficulty")]
    _difficulty: String,
    #[serde(default = "default_max_steps")]
    max_steps: u32,
}

fn default_max_steps() -> u32 {
    500
}

pub fn project(hint: &HintResult) -> Value {
    match hint {
        HintResult::ReviewEntry { cell } => json!({"kind":"review-entry","cell":cell}),
        HintResult::Unavailable(reason) => {
            json!({"kind":"unavailable","reason":match reason { HintUnavailable::Complete => "complete", HintUnavailable::Unsupported => "unsupported", HintUnavailable::BudgetExhausted => "budget-exhausted" }})
        }
        HintResult::Deduction { steps, placement } => {
            json!({"kind":"deduction","steps":steps.iter().map(project_step).collect::<Vec<_>>(),"placement":{"cell":placement.cell,"digit":placement.digit}})
        }
    }
}

pub fn evaluate(input: HintInput) -> Result<Value, Box<dyn std::error::Error>> {
    let board = Board::try_from(input.board.as_slice())?;
    let solution = Board::try_from(input.solution.as_slice())?;
    let rules = compile_rules(&decode_rules(&input.rules)?)?;
    let mut budget = WorkBudget::new(input.limit);
    let hint = analyze_hint(&board, &solution, &rules, input.max_steps, &mut budget);
    let mut result = project(&hint);
    result["workUsed"] = json!(budget.used());
    Ok(result)
}
