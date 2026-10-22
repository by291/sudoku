use super::propagation::count_propagation_solutions;
use super::types::SearchResult;
use crate::board::is_complete;
use crate::constraints::computation::prepare_computation;
use crate::constraints::types::PreparedComputation;
use crate::control::ExecutionControl;
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
    }
}

/// Count up to two solutions using immutable preparation.
/// Every call owns its domains, trail and returned board.
pub fn count_solutions(
    board: &Board,
    computation: &PreparedComputation,
    control: &mut ExecutionControl,
    node_limit: u64,
) -> SearchResult {
    if directly_contradictory(board, &computation.rules) {
        return contradictory_result();
    }

    count_propagation_solutions(board, computation, control, node_limit)
}

/// Standalone counting validates rules and rejects direct contradictions before preparing search.
pub fn count_with_rules(
    board: &Board,
    rules: &PuzzleRules,
    control: &mut ExecutionControl,
    node_limit: u64,
) -> CoreResult<SearchResult> {
    if directly_contradictory_rules(board, rules)? {
        return Ok(contradictory_result());
    }

    let Bounded::Complete(computation) = prepare_computation(rules, control)? else {
        return Ok(SearchResult::Incomplete { nodes_visited: 0 });
    };

    let result = count_solutions(board, &computation, control, node_limit);
    Ok(result)
}
