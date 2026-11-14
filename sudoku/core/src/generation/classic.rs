use super::terminal_construction::{TerminalConstructionResult, construct_unit_terminal};
use crate::control::ExecutionControl;
use crate::random::SeededRandom;
use crate::rules::context::prepare_rules;
use crate::rules::types::PuzzleRules;
use crate::types::{Bounded, CoreResult};

/// Construct a Classic terminal and propagate an interrupted rules preparation.
pub fn construct_classic_terminal(
    random: &mut SeededRandom,
    control: &mut ExecutionControl,
) -> CoreResult<TerminalConstructionResult> {
    let Bounded::Complete(rules) = prepare_rules(&PuzzleRules::Classic, control)? else {
        return Ok(TerminalConstructionResult::Incomplete);
    };

    Ok(construct_unit_terminal(&rules, random, control, None))
}
