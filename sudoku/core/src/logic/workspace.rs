use super::pattern_facts::mask_of;
use super::types::{Evidence, LogicalAction, LogicalStep, LogicalWorkspace};
use crate::board::base_candidates;
use crate::constraints::types::PreparedComputation;
use crate::rules::types::{PreparedRules, PuzzleRules};
use crate::types::{BOARD_SIZE, Board, CandidateMask, CoreResult, EngineError};

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

/// Reuse the immutable layout; every board still owns its complete mutable state.
pub fn create_prepared_workspace(
    board: &Board,
    computation: &PreparedComputation,
) -> LogicalWorkspace {
    let mut state = create_workspace(board, computation.rules());
    state.support = Some(computation.support().clone());
    state
}

impl LogicalWorkspace {
    /// Own an authored board/domain snapshot with fresh premises and caches.
    /// Earlier eliminations must be independently sound; this does not prove them.
    /// Empty domains are allowed for contradiction exercises. Filled cells require empty masks,
    /// and other domains must be subsets of the initial logical candidates for these rules.
    ///
    /// # Errors
    /// Returns an error for candidates on filled cells or reintroduced initial exclusions.
    pub fn from_authored_candidates(
        board: &Board,
        candidates: [CandidateMask; BOARD_SIZE],
        rules: &PreparedRules,
    ) -> CoreResult<Self> {
        let mut state = create_workspace(board, rules);
        if candidates
            .iter()
            .zip(&state.candidates)
            .any(|(authored, initial)| authored.bits() & !initial.bits() != 0)
        {
            return Err(EngineError::invalid(
                "Authored candidates exceed initial logical domains",
            ));
        }

        state.candidates = candidates;
        Ok(state)
    }
}

/// Apply an engine-produced or independently proved step for this exact workspace state.
/// This checks action shape/applicability, not mathematical evidence. Premises survive until placement.
///
/// # Errors
/// Returns an error without mutation if any action cell, digit or domain is inapplicable.
pub fn apply_step(state: &mut LogicalWorkspace, step: &LogicalStep) -> CoreResult<()> {
    let applicable = |cell: usize, digit: u8| {
        cell < BOARD_SIZE
            && (1..=9).contains(&digit)
            && state.board.values()[cell] == 0
            && state.candidates[cell].bits() & mask_of(digit) != 0
    };
    let valid = match &step.action {
        LogicalAction::Placement { cell, digit } => applicable(*cell, *digit),
        LogicalAction::Elimination { removals } => {
            !removals.is_empty()
                && removals
                    .iter()
                    .all(|removal| applicable(removal.cell, removal.digit))
        }
    };
    if !valid {
        return Err(EngineError::invalid(
            "Logical action is not applicable to this workspace",
        ));
    }

    // Validate the entire batch before any removal or premise can change the workspace.
    apply_established_step(state, step);
    Ok(())
}

/// The detector or proof validator has already established this step for the current state.
pub(crate) fn apply_established_step(state: &mut LogicalWorkspace, step: &LogicalStep) {
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
