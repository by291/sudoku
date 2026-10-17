pub mod validation;

use crate::board::is_complete;
use crate::budget::WorkBudget;
use crate::logic::solver::find_step;
use crate::logic::types::{LogicalAction, LogicalStep};
use crate::logic::workspace::{apply_established_step, create_workspace};
use crate::rating::policies::hint_techniques_slice;
use crate::rules::types::PreparedRules;
use crate::types::{Board, Bounded};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Placement {
    pub cell: usize,
    pub digit: u8,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HintUnavailable {
    Complete,
    Unsupported,
    BudgetExhausted,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum HintResult {
    ReviewEntry {
        cell: usize,
    },
    Deduction {
        steps: Vec<LogicalStep>,
        placement: Placement,
    },
    Unavailable(HintUnavailable),
}

/// Return the first incorrect entry or an owned elimination-to-placement chain using one caller budget.
pub fn analyze_hint(
    board: &Board,
    solution: &Board,
    rules: &PreparedRules,
    max_steps: u32,
    budget: &mut WorkBudget,
) -> HintResult {
    if let Some(cell) = board
        .values()
        .iter()
        .enumerate()
        .position(|(cell, &value)| value != 0 && value != solution.values()[cell])
    {
        return HintResult::ReviewEntry { cell };
    }
    if is_complete(board, rules) {
        return HintResult::Unavailable(HintUnavailable::Complete);
    }

    let mut state = create_workspace(board, rules);
    let techniques = hint_techniques_slice(rules.rules().variant());
    let mut steps = vec![];
    for _ in 0..max_steps {
        let step = match find_step(&mut state, techniques, budget) {
            Bounded::BudgetExhausted => {
                return HintResult::Unavailable(HintUnavailable::BudgetExhausted);
            }
            Bounded::Complete(None) => {
                return HintResult::Unavailable(HintUnavailable::Unsupported);
            }
            Bounded::Complete(Some(step)) => *step,
        };
        let placement = if let LogicalAction::Placement { cell, digit } = step.action {
            Some(Placement { cell, digit })
        } else {
            None
        };
        if placement.is_none() {
            apply_established_step(&mut state, &step);
        }
        steps.push(step);
        if let Some(placement) = placement {
            return HintResult::Deduction { steps, placement };
        }
    }
    HintResult::Unavailable(HintUnavailable::BudgetExhausted)
}
