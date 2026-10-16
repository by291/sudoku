use crate::fixtures::decode_rules;
use crate::violation_projection::project_violation;
use serde::Deserialize;
use serde_json::{Value, json};
use sudoku_core::budget::WorkBudget;
use sudoku_core::constraints::candidates::evaluate_candidates;
use sudoku_core::constraints::conflicts::evaluate_conflicts;
use sudoku_core::constraints::support::prepare_constraint_support;
use sudoku_core::constraints::types::{CatalogueLimits, ConflictStatus, SupportResult};
use sudoku_core::rules::context::compile_rules;
use sudoku_core::types::{Board, Bounded, CandidateMask};

type FixtureResult = Result<Value, Box<dyn std::error::Error>>;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ConstraintInput {
    rules: Value,
    board: Vec<u8>,
    limit: u64,
}

pub fn evaluate(input: ConstraintInput) -> FixtureResult {
    let board = Board::try_from(input.board.as_slice())?;
    let rules = compile_rules(&decode_rules(&input.rules)?)?;
    let mut candidates_budget = WorkBudget::new(input.limit);
    let candidates = match evaluate_candidates(&board, &rules, &mut candidates_budget) {
        Bounded::Complete(candidates) => {
            json!({"status":"complete","candidates":candidates.iter().map(|mask|mask.bits()).collect::<Vec<_>>()})
        }
        Bounded::BudgetExhausted => json!({"status":"budget-exhausted"}),
    };
    let mut conflicts_budget = WorkBudget::new(input.limit);
    let conflicts = evaluate_conflicts(&board, &rules, &mut conflicts_budget);
    let status = match conflicts.status {
        ConflictStatus::Complete => "complete",
        ConflictStatus::BudgetExhausted => "budget-exhausted",
    };

    Ok(
        json!({"candidates":candidates,"candidateWork":candidates_budget.used(),"conflicts":{"status":status,"violations":conflicts.violations.into_iter().map(project_violation).collect::<Vec<_>>()},"workUsed":conflicts_budget.used()}),
    )
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Limits {
    max_tuples_per_constraint: usize,
    max_tuples_per_layout: usize,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SupportInput {
    rules: Value,
    board: Vec<u8>,
    domains: Vec<u16>,
    limits: Limits,
    query_limit: u64,
    prepare_limit: u64,
    index: usize,
}

pub fn evaluate_support(input: SupportInput) -> FixtureResult {
    let board = Board::try_from(input.board.as_slice())?;
    let rules = compile_rules(&decode_rules(&input.rules)?)?;
    let masks: Vec<CandidateMask> = input
        .domains
        .into_iter()
        .map(CandidateMask::try_from)
        .collect::<Result<_, _>>()?;
    let domains: [CandidateMask; 81] = masks.try_into().map_err(|_| "Invalid domain count")?;
    let limits = CatalogueLimits {
        max_tuples_per_constraint: input.limits.max_tuples_per_constraint,
        max_tuples_per_layout: input.limits.max_tuples_per_layout,
    };
    let mut preparation = WorkBudget::new(input.prepare_limit);
    let Bounded::Complete(support) = prepare_constraint_support(&rules, &mut preparation, limits)?
    else {
        return Err("Expected complete fixture preparation".into());
    };
    let mut budget = WorkBudget::new(input.query_limit);
    let result = match support.get(&board, &domains, input.index, &mut budget)? {
        SupportResult::Complete(snapshot) => {
            json!({"status":"complete","cells":snapshot.cells,"supports":snapshot.supports.iter().map(|mask|mask.bits()).collect::<Vec<_>>()})
        }
        SupportResult::BudgetExhausted => json!({"status":"budget-exhausted"}),
    };
    Ok(json!({"result":result,"prepareWork":preparation.used(),"queryWork":budget.used()}))
}
