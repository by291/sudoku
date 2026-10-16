use super::support::prepare_constraint_support;
use super::types::{CatalogueLimits, PreparedComputation};
use crate::budget::WorkBudget;
use crate::rules::context::prepare_rules;
use crate::rules::types::PuzzleRules;
use crate::types::{Bounded, CoreResult};

/// One request pays for topology and complete static catalogues once; partial preparation escapes neither.
pub fn prepare_computation(
    rules: &PuzzleRules,
    budget: &mut WorkBudget,
) -> CoreResult<Bounded<PreparedComputation>> {
    let Bounded::Complete(prepared_rules) = prepare_rules(rules, budget)? else {
        return Ok(Bounded::BudgetExhausted);
    };
    let Bounded::Complete(support) =
        prepare_constraint_support(&prepared_rules, budget, CatalogueLimits::default())?
    else {
        return Ok(Bounded::BudgetExhausted);
    };
    Ok(Bounded::Complete(PreparedComputation {
        rules: prepared_rules,
        support,
    }))
}
