//! Validate authored candidate-relative deductions independently of live detector ordering.
use super::step_shape::valid_step_shape;
use super::step_validation::{ValidationMode, invalid, validate_step_and_apply};
use super::types::{LogicalStep, LogicalWorkspace};
use crate::control::ExecutionControl;
use crate::rules::context::compile_rules;
use crate::rules::types::PuzzleRules;
use crate::types::{BOARD_SIZE, Board, CandidateMask, CoreResult};

/// Validates one authored deduction against its explicit candidate state, without exact search.
/// The caller must establish that earlier candidate eliminations are sound.
/// Candidates may reflect earlier explained deductions; no state or cache survives this call.
pub fn validate_teaching_step(
    board: &Board,
    candidates: [CandidateMask; BOARD_SIZE],
    rules: &PuzzleRules,
    step: &LogicalStep,
) -> CoreResult<()> {
    validate_teaching_step_with_control(
        board,
        candidates,
        rules,
        step,
        &mut ExecutionControl::new(),
    )
}

/// Validate one owned teaching snapshot with a caller-owned cancellation control.
pub fn validate_teaching_step_with_control(
    board: &Board,
    candidates: [CandidateMask; BOARD_SIZE],
    rules: &PuzzleRules,
    step: &LogicalStep,
    control: &mut ExecutionControl,
) -> CoreResult<()> {
    if !valid_step_shape(step)
        || board
            .values()
            .iter()
            .zip(candidates)
            .any(|(&value, mask)| value != 0 && mask != CandidateMask::EMPTY)
    {
        return Err(invalid());
    }
    let context = compile_rules(rules)?;
    let workspace = LogicalWorkspace::from_authored_candidates(board, candidates, &context)?;
    let mut state = Some(workspace);
    let mut step = step.clone();
    validate_step_and_apply(
        &mut step,
        &context,
        &mut state,
        control,
        ValidationMode::Teaching,
    )
}
