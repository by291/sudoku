use super::basic_techniques::find_basic_step;
use super::techniques::{ALL_CLASSIC_TECHNIQUES, Technique};
use super::types::{LogicResult, LogicStatus, LogicalStep, LogicalWorkspace, StepOutcome};
use super::variant_techniques::find_variant_step;
use super::workspace::{apply_step, create_workspace};
use crate::board::is_complete;
use crate::budget::{WorkBudget, WorkStage};
use crate::rules::types::{PreparedRules, PuzzleRules};
use crate::types::{Board, Bounded};

/// Classic uses catalogue order; variants retain the caller's explicit policy priorities.
pub fn find_step(
    state: &mut LogicalWorkspace,
    allowed: &[Technique],
    budget: &mut WorkBudget,
) -> StepOutcome {
    budget.with_stage(WorkStage::Logic, |budget| {
        let ordered: Vec<Technique> = if matches!(state.rules.rules(), PuzzleRules::Classic) {
            ALL_CLASSIC_TECHNIQUES
                .into_iter()
                .filter(|technique| allowed.contains(technique))
                .collect()
        } else {
            allowed.to_vec()
        };
        if !budget.consume(1) {
            return Bounded::BudgetExhausted;
        }
        for technique in ordered {
            if technique.is_classic() {
                // Advanced detector dispatch is completed in the next migration task before cutover.
                if let Some(step) = find_basic_step(state, technique) {
                    return Bounded::Complete(Some(Box::new(step)));
                }
            } else {
                let result = find_variant_step(state, &[technique], budget);
                if !matches!(result, Bounded::Complete(None)) {
                    return result;
                }
            }
        }
        Bounded::Complete(None)
    })
}

pub fn analyze_logic(
    board: &Board,
    rules: &PreparedRules,
    allowed: &[Technique],
    max_steps: u32,
    budget: &mut WorkBudget,
) -> LogicResult {
    let mut state = create_workspace(board, rules);
    analyze_workspace(&mut state, allowed, max_steps, budget, &[])
}

/// Resume only a workspace described by previous_steps under a policy retaining its priority prefix.
/// The limit includes previous steps; returned board and trace are owned snapshots.
pub fn analyze_workspace(
    state: &mut LogicalWorkspace,
    allowed: &[Technique],
    max_steps: u32,
    budget: &mut WorkBudget,
    previous_steps: &[LogicalStep],
) -> LogicResult {
    let mut steps = previous_steps.to_vec();
    let status = loop {
        if is_complete(&state.board, &state.rules) {
            break LogicStatus::Solved;
        }
        if steps.len() >= max_steps as usize {
            break LogicStatus::StepLimit;
        }

        let step = match find_step(state, allowed, budget) {
            Bounded::BudgetExhausted => break LogicStatus::WorkLimit,
            Bounded::Complete(None) => break LogicStatus::Stalled,
            Bounded::Complete(Some(step)) => step,
        };
        apply_step(state, &step);
        steps.push(*step);
    };
    LogicResult {
        status,
        board: state.board.clone(),
        steps,
    }
}
