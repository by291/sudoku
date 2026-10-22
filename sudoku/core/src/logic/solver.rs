use super::advanced_techniques::find_advanced_step;
use super::basic_techniques::find_basic_step;
use super::techniques::{Technique, execution_order};
use super::types::{LogicResult, LogicStatus, LogicalStep, LogicalWorkspace, StepOutcome};
use super::variant_techniques::find_variant_step;
use super::workspace::{apply_established_step, create_workspace};
use crate::board::is_complete;
use crate::control::ExecutionControl;
use crate::rules::types::PreparedRules;
use crate::types::{Board, Bounded};

/// Classic uses catalogue order; variants retain the caller's explicit policy priorities.
pub fn find_step(
    state: &mut LogicalWorkspace,
    allowed: &[Technique],
    control: &mut ExecutionControl,
) -> StepOutcome {
    let order = execution_order(state.rules.rules().variant(), allowed);

    // Check cancellation before scanning techniques, including an empty policy.
    if !control.check() {
        return Bounded::Cancelled;
    }

    for technique in order {
        // Incomplete detector work must stop the scan rather than fall through to another technique.
        if technique.is_advanced() {
            let result = find_advanced_step(state, technique, control);
            if !matches!(result, Bounded::Complete(None)) {
                return result;
            }
        } else if technique.is_classic() {
            if let Some(step) = find_basic_step(state, technique) {
                return Bounded::Complete(Some(Box::new(step)));
            }
        } else {
            let result = find_variant_step(state, &[technique], control);
            if !matches!(result, Bounded::Complete(None)) {
                return result;
            }
        }
    }

    Bounded::Complete(None)
}

pub fn analyze_logic(
    board: &Board,
    rules: &PreparedRules,
    allowed: &[Technique],
    max_steps: u32,
    control: &mut ExecutionControl,
) -> LogicResult {
    let mut state = create_workspace(board, rules);
    analyze_workspace(&mut state, allowed, max_steps, control, &[])
}

/// Resume only a workspace described by previous_steps under a policy retaining its priority prefix.
/// The limit includes previous steps; returned board and trace are owned snapshots.
pub fn analyze_workspace(
    state: &mut LogicalWorkspace,
    allowed: &[Technique],
    max_steps: u32,
    control: &mut ExecutionControl,
    previous_steps: &[LogicalStep],
) -> LogicResult {
    analyze_workspace_owned(state, allowed, max_steps, control, previous_steps.to_vec())
}

/// Continues a private workspace by moving its existing trace instead of copying evidence.
pub(crate) fn analyze_workspace_owned(
    state: &mut LogicalWorkspace,
    allowed: &[Technique],
    max_steps: u32,
    control: &mut ExecutionControl,
    mut steps: Vec<LogicalStep>,
) -> LogicResult {
    let status = loop {
        if is_complete(&state.board, &state.rules) {
            break LogicStatus::Solved;
        }
        if steps.len() >= max_steps as usize {
            break LogicStatus::StepLimit;
        }

        let step = match find_step(state, allowed, control) {
            Bounded::Cancelled => break LogicStatus::Cancelled,
            Bounded::Complete(None) => break LogicStatus::Stalled,
            Bounded::Complete(Some(step)) => step,
        };

        apply_established_step(state, &step);
        steps.push(*step);
    };

    LogicResult {
        status,
        board: state.board.clone(),
        steps,
    }
}
