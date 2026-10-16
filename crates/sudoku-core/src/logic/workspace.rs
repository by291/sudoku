use super::pattern_facts::mask_of;
use super::types::{Evidence, LogicalAction, LogicalStep, LogicalWorkspace};
use crate::board::base_candidates;
use crate::constraints::types::PreparedComputation;
use crate::rules::types::{PreparedRules, PuzzleRules};
use crate::types::{Board, CandidateMask};

/// Copies the board; no domains, premises or memo entries carry over from another clue mask.
pub fn create_workspace(board: &Board, rules: &PreparedRules) -> LogicalWorkspace {
    let candidates = if matches!(rules.rules(), PuzzleRules::Killer { .. }) {
        // Cage exclusion must appear as an explained deduction, so initialize from full units only.
        std::array::from_fn(|cell| {
            if board.values()[cell] != 0 {
                return CandidateMask::EMPTY;
            }

            let mut bits = CandidateMask::ALL.bits();
            for &index in &rules.context().cell_units[cell] {
                for &peer in &rules.context().units[index].cells {
                    if board.values()[peer] != 0 {
                        bits &= !mask_of(board.values()[peer]);
                    }
                }
            }
            CandidateMask::from_computed_bits(bits)
        })
    } else {
        base_candidates(board, rules)
    };
    LogicalWorkspace {
        board: board.clone(),
        candidates,
        rules: rules.clone(),
        premises: vec![],
        support: None,
        cage_memo: (0..rules.context().constraints.len())
            .map(|_| None)
            .collect(),
    }
}

/// Reuse only the already charged layout; every board still owns its complete mutable state.
pub fn create_prepared_workspace(
    board: &Board,
    computation: &PreparedComputation,
) -> LogicalWorkspace {
    let mut state = create_workspace(board, computation.rules());
    state.support = Some(computation.support().clone());
    state
}

/// Apply an engine-produced or validated step for this workspace. Premises survive until a placement.
pub fn apply_step(state: &mut LogicalWorkspace, step: &LogicalStep) {
    match &step.action {
        LogicalAction::Elimination { removals } => {
            for removal in removals {
                state.candidates[removal.cell] = CandidateMask::from_computed_bits(
                    state.candidates[removal.cell].bits() & !mask_of(removal.digit),
                );
            }
            if let Evidence::Rule(evidence) = &step.evidence {
                state.premises.push(evidence.clone());
            }
        }
        LogicalAction::Placement { cell, digit } => {
            let mut values = *state.board.values();
            values[*cell] = *digit;
            state.board = Board::from_computed_values(values);
            state.candidates[*cell] = CandidateMask::EMPTY;
            // Only full units propagate here; cage and path effects need their own explained steps.
            for &index in &state.rules.context().cell_units[*cell] {
                for &peer in &state.rules.context().units[index].cells {
                    state.candidates[peer] = CandidateMask::from_computed_bits(
                        state.candidates[peer].bits() & !mask_of(*digit),
                    );
                }
            }
            state.premises.clear();
        }
    }
}

pub(crate) fn local_domains(state: &LogicalWorkspace, cells: &[usize]) -> Vec<CandidateMask> {
    cells
        .iter()
        .map(|&cell| {
            if state.board.values()[cell] == 0 {
                state.candidates[cell]
            } else {
                CandidateMask::from_computed_bits(mask_of(state.board.values()[cell]))
            }
        })
        .collect()
}

pub(crate) fn all_digits() -> Vec<u8> {
    (1..=9).collect()
}
