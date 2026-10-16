use super::terminal_construction::{TerminalConstructionResult, construct_unit_terminal};
use crate::budget::WorkBudget;
use crate::random::SeededRandom;
use crate::rules::context::prepare_rules;
use crate::rules::types::PuzzleRules;
use crate::types::{Bounded, CoreResult, EngineError};

pub fn construct_classic_terminal(
    random: &mut SeededRandom,
    budget: &mut WorkBudget,
) -> CoreResult<TerminalConstructionResult> {
    let Bounded::Complete(rules) = prepare_rules(&PuzzleRules::Classic, budget)? else {
        return Err(EngineError::invalid(
            "Static Classic preparation unexpectedly exhausted",
        ));
    };
    Ok(construct_unit_terminal(&rules, random, budget, None))
}
