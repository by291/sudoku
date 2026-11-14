use super::propagation::{PropagationSearch, count_propagation_solutions};
use super::types::SearchResult;
use crate::board::{KnownCompletion, is_complete};
use crate::constraints::computation::prepare_computation;
use crate::constraints::types::PreparedComputation;
use crate::control::ExecutionControl;
use crate::rules::evaluation::directly_contradictory_rules;
use crate::rules::types::{PreparedRules, PuzzleRules};
use crate::types::{Board, Bounded, CoreResult};

fn directly_contradictory(board: &Board, rules: &PreparedRules) -> bool {
    let duplicate_peers = &rules.context().duplicate_peers;
    let has_duplicate = duplicate_peers.iter().enumerate().any(|(cell, peers)| {
        let digit = board.values()[cell];
        digit != 0 && peers.iter().any(|&peer| board.values()[peer] == digit)
    });

    // A full board also has enough information to reject arithmetic violations directly.
    has_duplicate || (!board.values().contains(&0) && !is_complete(board, rules))
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
/// The node limit counts visits. Exhaustion cannot establish a solution count.
pub fn count_solutions(
    board: &Board,
    computation: &PreparedComputation,
    control: &mut ExecutionControl,
    node_limit: u64,
) -> SearchResult {
    if directly_contradictory(board, &computation.rules) {
        return contradictory_result();
    }

    count_propagation_solutions(PropagationSearch {
        board,
        computation,
        control,
        node_limit,
        known: None,
    })
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

pub(crate) struct CompletionSearch<'layout> {
    pub board: &'layout Board,
    pub computation: &'layout PreparedComputation,
    pub completion: &'layout KnownCompletion,
    pub node_limit: u64,
}

/// Count alternatives to a validated completion, without changing the public first-solution order.
/// A complete count of one still requires exhausting every alternative branch.
pub(crate) fn count_with_completion(
    search: CompletionSearch<'_>,
    control: &mut ExecutionControl,
) -> CoreResult<SearchResult> {
    let CompletionSearch {
        board,
        computation,
        completion,
        node_limit,
    } = search;

    if !completion.covers(board, computation.rules()) {
        return Err(crate::types::EngineError::invalid(
            "Board does not belong to the known completion",
        ));
    }

    Ok(count_propagation_solutions(PropagationSearch {
        board,
        computation,
        control,
        node_limit,
        known: Some(completion.board()),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::KnownCompletion;

    #[test]
    fn known_completion_search_proves_uniqueness_and_still_finds_digit_swaps() {
        let Bounded::Complete(computation) =
            prepare_computation(&PuzzleRules::Classic, &mut ExecutionControl::new()).unwrap()
        else {
            panic!("Expected preparation");
        };
        let values: [u8; 81] =
            std::array::from_fn(|cell| ((cell / 9 * 3 + cell / 27 + cell % 9) % 9 + 1) as u8);
        let terminal = Board::try_from(values.as_slice()).unwrap();
        let completion = KnownCompletion::new(&terminal, computation.rules()).unwrap();
        let mut partial = values;
        partial[0] = 0;
        let unique = Board::try_from(partial.as_slice()).unwrap();

        let counted = count_with_completion(
            CompletionSearch {
                board: &unique,
                computation: &computation,
                completion: &completion,
                node_limit: 100,
            },
            &mut ExecutionControl::new(),
        )
        .unwrap();

        assert!(matches!(
            counted,
            SearchResult::Complete {
                count: 1,
                solution: Some(solution),
                ..
            } if solution == terminal
        ));
        assert!(matches!(
            count_with_completion(
                CompletionSearch {
                    board: &unique,
                    computation: &computation,
                    completion: &completion,
                    node_limit: 0,
                },
                &mut ExecutionControl::new(),
            )
            .unwrap(),
            SearchResult::Incomplete { nodes_visited: 0 }
        ));

        // Swapping every one and two produces a different valid completion of these givens.
        let ambiguous = Board::try_from(
            values
                .map(|digit| match digit {
                    1 | 2 => 0,
                    _ => digit,
                })
                .as_slice(),
        )
        .unwrap();
        assert!(matches!(
            count_with_completion(
                CompletionSearch {
                    board: &ambiguous,
                    computation: &computation,
                    completion: &completion,
                    node_limit: 100,
                },
                &mut ExecutionControl::new(),
            )
            .unwrap(),
            SearchResult::Complete { count: 2, .. }
        ));
        partial[0] = 2;
        assert!(
            count_with_completion(
                CompletionSearch {
                    board: &Board::try_from(partial.as_slice()).unwrap(),
                    computation: &computation,
                    completion: &completion,
                    node_limit: 100,
                },
                &mut ExecutionControl::new(),
            )
            .is_err()
        );
    }
}
