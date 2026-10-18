use crate::fixtures::decode_rules;
use crate::logical_projection::project_step;
use serde::Deserialize;
use serde_json::{Value, json};
use sudoku_core::budget::WorkBudget;
use sudoku_core::logic::solver::analyze_logic;
use sudoku_core::logic::techniques::{ALL_CLASSIC_TECHNIQUES, Technique};
use sudoku_core::logic::types::{LogicResult, LogicStatus};
use sudoku_core::rules::types::PuzzleRules;
use sudoku_core::types::Board;

type FixtureResult = Result<Value, Box<dyn std::error::Error>>;

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct LogicInput {
    board: Vec<u8>,
    rules: Value,
    limit: u64,
    #[serde(rename = "solution")]
    _solution: Vec<u8>,
    #[serde(rename = "difficulty")]
    _difficulty: String,
    #[serde(default)]
    allowed: Option<Vec<String>>,
    #[serde(default = "default_step_limit")]
    max_steps: u32,
}

fn default_step_limit() -> u32 {
    500
}

pub fn project_result(result: &LogicResult) -> Value {
    let mut value = json!({"status":match result.status { LogicStatus::Solved => "solved", LogicStatus::Stalled => "stalled", LogicStatus::WorkLimit | LogicStatus::StepLimit => "budget-exhausted" },"board":result.board.values().to_vec(),"steps":result.steps.iter().map(project_step).collect::<Vec<_>>()});
    match result.status {
        LogicStatus::WorkLimit => value["cause"] = json!("work-limit"),
        LogicStatus::StepLimit => value["cause"] = json!("logical-step-limit"),
        LogicStatus::Solved | LogicStatus::Stalled => {}
    }
    value
}

pub fn evaluate(input: LogicInput) -> FixtureResult {
    let board = Board::try_from(input.board.as_slice())?;
    let rules = decode_rules(&input.rules)?;
    let rules = sudoku_core::rules::context::compile_rules(&rules)?;
    let allowed = if let Some(allowed) = input.allowed {
        allowed
            .iter()
            .map(|name| Technique::parse(name).ok_or("Unknown fixture technique"))
            .collect::<Result<Vec<_>, _>>()?
    } else if matches!(rules.rules(), PuzzleRules::Classic) {
        ALL_CLASSIC_TECHNIQUES.to_vec()
    }
    // Test-only hard policy superset: inapplicable clue techniques perform no visits or charges.
    else {
        vec![
            Technique::NakedSingle,
            Technique::HiddenSingle,
            Technique::CageDistinct,
            Technique::CageRemainder,
            Technique::ThermoBound,
            Technique::ArrowEquation,
            Technique::LockedCandidate,
            Technique::CageCombination,
            Technique::ArrowCombination,
            Technique::NakedPair,
            Technique::HiddenPair,
        ]
    };
    let mut budget = WorkBudget::new(input.limit);
    let result = analyze_logic(&board, &rules, &allowed, input.max_steps, &mut budget);
    let mut value = project_result(&result);
    value["workUsed"] = json!(budget.used());
    Ok(value)
}
