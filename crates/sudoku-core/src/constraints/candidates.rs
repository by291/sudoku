use super::support::raw_for_constraint;
use super::types::{CandidateResult, PreparedComputation, PreparedConstraintSupport};
use crate::board::base_candidates;
use crate::budget::WorkBudget;
use crate::rules::types::PreparedRules;
use crate::types::{BOARD_SIZE, Board, Bounded, CandidateMask};

fn evaluate(
    board: &Board,
    rules: &PreparedRules,
    support: Option<&PreparedConstraintSupport>,
    budget: &mut WorkBudget,
) -> CandidateResult {
    let mut candidates = base_candidates(board, rules);
    let mut changed = true;
    while changed {
        changed = false;
        for (index, constraint) in rules.context().constraints.iter().enumerate() {
            if !budget.consume(1) {
                return Bounded::BudgetExhausted;
            }
            let result = match support {
                Some(prepared) => prepared.query_at(board, &candidates, index, budget),
                None => raw_for_constraint(board, &candidates, rules, constraint, budget),
            };
            let Bounded::Complete(local) = result else {
                return Bounded::BudgetExhausted;
            };
            if local.supports.iter().any(|mask| mask.bits() == 0) {
                return Bounded::Complete([CandidateMask::EMPTY; BOARD_SIZE]);
            }
            for (&cell, mask) in local.cells.iter().zip(&local.supports) {
                if board.values()[cell] != 0 {
                    continue;
                }
                let reduced = candidates[cell].bits() & mask.bits();
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
    budget: &mut WorkBudget,
) -> CandidateResult {
    evaluate(board, rules, None, budget)
}

pub fn evaluate_prepared_candidates(
    board: &Board,
    computation: &PreparedComputation,
    budget: &mut WorkBudget,
) -> CandidateResult {
    evaluate(
        board,
        &computation.rules,
        Some(&computation.support),
        budget,
    )
}
