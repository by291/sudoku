use super::support::prepare_constraint_support;
use super::types::{CatalogueLimits, PreparedComputation};
use crate::control::ExecutionControl;
use crate::rules::context::prepare_rules;
use crate::rules::types::PuzzleRules;
use crate::types::{Bounded, CoreResult};

/// Prepare immutable topology and complete static catalogues for reuse within a layout.
/// Cancellation discards any partially prepared result.
pub fn prepare_computation(
    rules: &PuzzleRules,
    control: &mut ExecutionControl,
) -> CoreResult<Bounded<PreparedComputation>> {
    let Bounded::Complete(prepared_rules) = prepare_rules(rules, control)? else {
        return Ok(Bounded::Cancelled);
    };

    let Bounded::Complete(support) =
        prepare_constraint_support(&prepared_rules, control, CatalogueLimits::default())?
    else {
        return Ok(Bounded::Cancelled);
    };

    Ok(Bounded::Complete(PreparedComputation {
        rules: prepared_rules,
        support,
    }))
}
