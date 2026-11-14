//! Whole-chain structure, normalization and ordered live replay.
use super::HintResult;
use crate::control::ExecutionControl;
use crate::logic::step_shape::{STEP_COUNT_LIMIT, valid_step_shape};
use crate::logic::step_validation::{StepReplay, ValidationMode, invalid, validate_step_and_apply};
use crate::logic::types::{Evidence, LogicalAction};
use crate::logic::workspace::create_workspace;
use crate::rules::context::prepare_rules;
use crate::rules::types::PuzzleRules;
use crate::types::{BOARD_SIZE, Board, Bounded, CoreResult, EngineError};

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

    let Some((last, preceding)) = steps.split_last() else {
        return Err(invalid());
    };
    if steps.len() > STEP_COUNT_LIMIT || !steps.iter().all(valid_step_shape) {
        return Err(invalid());
    }

    // A placement ends the chain, and the summary must identify that same action.
    let has_early_placement = preceding
        .iter()
        .any(|step| matches!(step.action, LogicalAction::Placement { .. }));
    let terminal_action = LogicalAction::Placement {
        cell: placement.cell,
        digit: placement.digit,
    };
    if has_early_placement || last.action != terminal_action {
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

    // Rule topology and proof replay share the caller's cancellation signal.
    let Bounded::Complete(context) = prepare_rules(rules, control)? else {
        return Err(EngineError::invalid(
            "Hint evidence validation was cancelled",
        ));
    };
    let mut state = board.map(|board| create_workspace(board, &context));

    // Each proof sees the domains left by all preceding actions.
    for step in steps {
        validate_step_and_apply(StepReplay {
            step,
            context: &context,
            state: &mut state,
            control,
            mode: ValidationMode::Hint,
        })?;
    }

    Ok(parsed)
}
