use super::support::{RawSupportQuery, SupportBoard, raw_for_constraint};
use super::types::{CandidateResult, PreparedComputation, PreparedConstraintSupport, SupportMasks};
use crate::board::base_candidates;
use crate::control::ExecutionControl;
use crate::rules::types::{PreparedRules, RuleConstraint};
use crate::types::{BOARD_SIZE, Board, Bounded, CandidateMask};

struct CandidateEvaluation<'layout> {
    board: &'layout Board,
    rules: &'layout PreparedRules,
    support: Option<&'layout PreparedConstraintSupport>,
}

fn narrow_unfilled_candidates(
    candidates: &mut [CandidateMask; BOARD_SIZE],
    board: &Board,
    update: (&RuleConstraint, &SupportMasks),
) -> bool {
    let (constraint, support) = update;
    let mut has_changes = false;

    for (&cell, mask) in constraint.cells().iter().zip(support.as_slice()) {
        if board.values()[cell] != 0 {
            continue;
        }

        let current = candidates[cell].bits();
        let reduced = current & mask;
        if reduced != current {
            candidates[cell] = CandidateMask::from_computed_bits(reduced);
            has_changes = true;
        }
    }

    has_changes
}

fn evaluate(input: CandidateEvaluation<'_>, control: &mut ExecutionControl) -> CandidateResult {
    let CandidateEvaluation {
        board,
        rules,
        support,
    } = input;

    if !control.check() {
        return Bounded::Cancelled;
    }

    let mut candidates = base_candidates(board, rules);
    // Narrowing one clue can invalidate candidates already checked by another clue.
    let mut has_changes = true;
    while has_changes {
        has_changes = false;
        for (index, constraint) in rules.context().constraints.iter().enumerate() {
            if !control.check() {
                return Bounded::Cancelled;
            }

            let support_board = SupportBoard {
                board,
                candidates: &candidates,
            };
            let result = match support {
                Some(prepared) => prepared.query_at(support_board, index, control),
                None => raw_for_constraint(
                    RawSupportQuery {
                        board: support_board,
                        rules,
                        constraint,
                    },
                    control,
                ),
            };
            let Bounded::Complete(local) = result else {
                return Bounded::Cancelled;
            };

            // An unsupported clue leaves no valid candidate grid for this board.
            if local.as_slice().contains(&0) {
                return Bounded::Complete([CandidateMask::EMPTY; BOARD_SIZE]);
            }

            has_changes |= narrow_unfilled_candidates(&mut candidates, board, (constraint, &local));
        }
    }

    Bounded::Complete(candidates)
}

/// Evaluate a board using raw local support until its candidate grid stabilizes.
pub fn evaluate_candidates(
    board: &Board,
    rules: &PreparedRules,
    control: &mut ExecutionControl,
) -> CandidateResult {
    evaluate(
        CandidateEvaluation {
            board,
            rules,
            support: None,
        },
        control,
    )
}

/// Evaluate candidates with the matching prepared layout and support catalogue.
pub fn evaluate_prepared_candidates(
    board: &Board,
    computation: &PreparedComputation,
    control: &mut ExecutionControl,
) -> CandidateResult {
    evaluate(
        CandidateEvaluation {
            board,
            rules: &computation.rules,
            support: Some(&computation.support),
        },
        control,
    )
}
