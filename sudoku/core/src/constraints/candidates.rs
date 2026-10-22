use super::support::raw_for_constraint;
use super::types::{CandidateResult, PreparedComputation, PreparedConstraintSupport};
use crate::board::base_candidates;
use crate::control::ExecutionControl;
use crate::rules::types::PreparedRules;
use crate::types::{BOARD_SIZE, Board, Bounded, CandidateMask};

fn evaluate(
    board: &Board,
    rules: &PreparedRules,
    support: Option<&PreparedConstraintSupport>,
    control: &mut ExecutionControl,
) -> CandidateResult {
    if !control.check() {
        return Bounded::Cancelled;
    }

    let mut candidates = base_candidates(board, rules);
    let mut changed = true;
    while changed {
        changed = false;
        for (index, constraint) in rules.context().constraints.iter().enumerate() {
            if !control.check() {
                return Bounded::Cancelled;
            }
            let result = match support {
                Some(prepared) => prepared.query_at(board, &candidates, index, control),
                None => raw_for_constraint(board, &candidates, rules, constraint, control),
            };
            let Bounded::Complete(local) = result else {
                return Bounded::Cancelled;
            };
            if local.as_slice().contains(&0) {
                return Bounded::Complete([CandidateMask::EMPTY; BOARD_SIZE]);
            }
            for (&cell, mask) in constraint.cells().iter().zip(local.as_slice()) {
                if board.values()[cell] != 0 {
                    continue;
                }
                let reduced = candidates[cell].bits() & mask;
                if reduced != candidates[cell].bits() {
                    candidates[cell] = CandidateMask::from_computed_bits(reduced);
                    changed = true;
                }
            }
        }
    }

    Bounded::Complete(candidates)
}

pub fn evaluate_candidates(
    board: &Board,
    rules: &PreparedRules,
    control: &mut ExecutionControl,
) -> CandidateResult {
    evaluate(board, rules, None, control)
}

pub fn evaluate_prepared_candidates(
    board: &Board,
    computation: &PreparedComputation,
    control: &mut ExecutionControl,
) -> CandidateResult {
    evaluate(
        board,
        &computation.rules,
        Some(&computation.support),
        control,
    )
}
