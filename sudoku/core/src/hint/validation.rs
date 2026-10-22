//! Whole-chain structure, normalization and ordered live replay.
use super::HintResult;
use crate::control::ExecutionControl;
use crate::logic::step_shape::{STEP_COUNT_LIMIT, valid_step_shape};
use crate::logic::step_validation::{ValidationMode, invalid, validate_step_and_apply};
use crate::logic::types::{Evidence, LogicalAction};
use crate::logic::workspace::create_workspace;
use crate::rules::context::compile_rules;
use crate::rules::types::PuzzleRules;
use crate::types::{BOARD_SIZE, Board, CoreResult};

/// Clone a hint and normalize omitted related-unit lists to `Some([])`.
/// This validates chain shape only; it does not bind clues or replay mathematical proofs.
pub fn validate_hint_shape(hint: &HintResult) -> CoreResult<HintResult> {
    let mut parsed = hint.clone();
    let HintResult::Deduction { steps, placement } = &mut parsed else {
        if matches!(parsed, HintResult::ReviewEntry { cell } if cell >= BOARD_SIZE) {
            return Err(invalid());
        }
        return Ok(parsed);
    };
    if steps.is_empty()
        || steps.len() > STEP_COUNT_LIMIT
        || !steps.iter().all(valid_step_shape)
        || steps[..steps.len() - 1]
            .iter()
            .any(|step| matches!(step.action, LogicalAction::Placement { .. }))
        || steps.last().is_none_or(|step| {
            step.action
                != (LogicalAction::Placement {
                    cell: placement.cell,
                    digit: placement.digit,
                })
        })
    {
        return Err(invalid());
    }

    for step in steps {
        if let Evidence::Unit { units, .. } = &mut step.evidence {
            units.get_or_insert_with(Vec::new);
        }
    }
    Ok(parsed)
}

/// Clone and bind a hint to exact ordered clues. With a board, replay each deduction;
/// without one, only basic/rule clue binding is available and advanced proofs are rejected.
pub fn validate_hint_evidence(
    hint: &HintResult,
    rules: &PuzzleRules,
    board: Option<&Board>,
) -> CoreResult<HintResult> {
    validate_hint_evidence_with_control(hint, rules, board, &mut ExecutionControl::new())
}

/// Replay owns its state while the caller supplies cooperative cancellation.
pub fn validate_hint_evidence_with_control(
    hint: &HintResult,
    rules: &PuzzleRules,
    board: Option<&Board>,
    control: &mut ExecutionControl,
) -> CoreResult<HintResult> {
    let mut parsed = validate_hint_shape(hint)?;
    let HintResult::Deduction { steps, .. } = &mut parsed else {
        return Ok(parsed);
    };

    let context = compile_rules(rules)?;
    let mut state = board.map(|board| create_workspace(board, &context));
    for step in steps {
        validate_step_and_apply(step, &context, &mut state, control, ValidationMode::Hint)?;
    }
    Ok(parsed)
}
