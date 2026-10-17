use crate::fixtures::decode_rules;
use crate::logical_projection::project_step;
use serde::Deserialize;
use serde_json::{Value, json};
use sudoku_core::budget::WorkBudget;
use sudoku_core::logic::advanced_evidence::validate_advanced_step;
use sudoku_core::logic::advanced_techniques::find_advanced_step;
use sudoku_core::logic::techniques::Technique;
use sudoku_core::logic::types::LogicalWorkspace;
use sudoku_core::rules::context::compile_rules;
use sudoku_core::types::{Board, Bounded, CandidateMask};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AdvancedInput {
    board: Vec<u8>,
    rules: Value,
    domains: Vec<u16>,
    technique: String,
    limit: u64,
}

pub fn evaluate(input: AdvancedInput) -> Result<Value, Box<dyn std::error::Error>> {
    let board = Board::try_from(input.board.as_slice())?;
    let rules = compile_rules(&decode_rules(&input.rules)?)?;
    let domains: Vec<CandidateMask> = input
        .domains
        .into_iter()
        .map(CandidateMask::try_from)
        .collect::<Result<_, _>>()?;
    let candidates = domains
        .try_into()
        .map_err(|_| "Expected 81 fixture domains")?;
    let state = LogicalWorkspace::from_authored_candidates(&board, candidates, &rules)?;
    let technique = Technique::parse(&input.technique).ok_or("Unknown fixture technique")?;
    let mut budget = WorkBudget::new(input.limit);
    let result = find_advanced_step(&state, technique, &mut budget);
    let (result, valid) = match result {
        Bounded::BudgetExhausted => (json!({"status":"budget-exhausted"}), None),
        Bounded::Complete(step) => {
            let valid = step
                .as_ref()
                .map(|step| validate_advanced_step(&state, step));
            (
                json!({"status":"complete","step":step.as_deref().map(project_step)}),
                valid,
            )
        }
    };
    Ok(json!({"result":result,"valid":valid,"workUsed":budget.used()}))
}
