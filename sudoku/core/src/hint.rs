pub mod validation;

use crate::board::is_complete;
use crate::control::ExecutionControl;
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
    Incomplete,
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

/// Return the first incorrect entry or an owned elimination-to-placement chain.
/// The caller supplies cooperative cancellation for deduction detection.
pub fn analyze_hint(
    board: &Board,
    solution: &Board,
    rules: &PreparedRules,
    max_steps: u32,
    control: &mut ExecutionControl,
) -> HintResult {
    // The solution can identify an incorrect entry, but supplies no deduction evidence.
    let values = board.values();
    let mut entries = values.iter().enumerate();
    if let Some(cell) =
        entries.position(|(cell, &value)| value != 0 && value != solution.values()[cell])
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
        let step = match find_step(&mut state, techniques, control) {
            Bounded::Cancelled => {
                return HintResult::Unavailable(HintUnavailable::Incomplete);
            }
            Bounded::Complete(None) => {
                return HintResult::Unavailable(HintUnavailable::Unsupported);
            }
            Bounded::Complete(Some(step)) => *step,
        };

        // The first placement finishes the hint. Only eliminations affect the next detection.
        if let LogicalAction::Placement { cell, digit } = step.action {
            steps.push(step);
            return HintResult::Deduction {
                steps,
                placement: Placement { cell, digit },
            };
        }

        apply_established_step(&mut state, &step);
        steps.push(step);
    }

    // A partial elimination chain has no placement to offer.
    HintResult::Unavailable(HintUnavailable::Incomplete)
}
