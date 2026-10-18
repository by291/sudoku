use super::propagation::count_propagation_solutions;
use super::types::SearchResult;
use crate::board::is_complete;
use crate::budget::{WorkBudget, WorkStage};
use crate::constraints::computation::prepare_computation;
use crate::constraints::types::PreparedComputation;
use crate::rules::evaluation::directly_contradictory_rules;
use crate::rules::types::{PreparedRules, PuzzleRules};
use crate::types::{Board, Bounded, CoreResult};

fn directly_contradictory(board: &Board, rules: &PreparedRules) -> bool {
    rules
        .context()
        .duplicate_peers
        .iter()
        .enumerate()
        .any(|(cell, peers)| {
            board.values()[cell] != 0
                && peers
                    .iter()
                    .any(|&peer| board.values()[peer] == board.values()[cell])
        })
        || (!board.values().contains(&0) && !is_complete(board, rules))
}

fn contradictory_result() -> SearchResult {
    SearchResult::Complete {
        count: 0,
        solution: None,
        nodes_visited: 0,
        work_used: 0,
    }
}

/// Count up to two solutions using already charged immutable preparation.
/// Every call owns its domains, trail and returned board.
pub fn count_solutions(
    board: &Board,
    computation: &PreparedComputation,
    budget: &mut WorkBudget,
    node_limit: u64,
) -> SearchResult {
    if directly_contradictory(board, &computation.rules) {
        return contradictory_result();
    }

    budget.with_stage(WorkStage::Exact, |budget| {
        count_propagation_solutions(board, computation, budget, node_limit)
    })
}

/// Standalone counting also charges preparation; direct contradictory givens retain the free rejection path.
pub fn count_with_rules(
    board: &Board,
    rules: &PuzzleRules,
    budget: &mut WorkBudget,
    node_limit: u64,
) -> CoreResult<SearchResult> {
    if directly_contradictory_rules(board, rules)? {
        return Ok(contradictory_result());
    }

    let started = budget.used();
    let Bounded::Complete(computation) = prepare_computation(rules, budget)? else {
        return Ok(SearchResult::BudgetExhausted {
            nodes_visited: 0,
            work_used: budget.used() - started,
        });
    };

    let result = count_solutions(board, &computation, budget, node_limit);
    Ok(result.with_work_used(budget.used() - started))
}
