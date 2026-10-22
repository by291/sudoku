use super::propagation::count_propagation_solutions;
use super::types::SearchResult;
use crate::board::{KnownCompletion, is_complete};
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

    count_propagation_solutions(board, computation, control, node_limit, None)
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

/// Count alternatives to a validated completion, without changing the public first-solution order.
/// A complete count of one still requires exhausting every alternative branch.
pub(crate) fn count_with_completion(
    board: &Board,
    computation: &PreparedComputation,
    completion: &KnownCompletion,
    control: &mut ExecutionControl,
    node_limit: u64,
) -> CoreResult<SearchResult> {
    if !completion.covers(board, computation.rules()) {
        return Err(crate::types::EngineError::invalid(
            "Board does not belong to the known completion",
        ));
    }
    Ok(count_propagation_solutions(
        board,
        computation,
        control,
        node_limit,
        Some(completion.board()),
    ))
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

        assert!(
            matches!(count_with_completion(&unique, &computation, &completion, &mut ExecutionControl::new(), 100).unwrap(),
            SearchResult::Complete { count: 1, solution: Some(solution), .. } if solution == terminal)
        );
        assert!(matches!(
            count_with_completion(
                &unique,
                &computation,
                &completion,
                &mut ExecutionControl::new(),
                0
            )
            .unwrap(),
            SearchResult::Incomplete { nodes_visited: 0 }
        ));

        // Swapping every one and two produces a different valid completion of these givens.
        let ambiguous = Board::try_from(
            values
                .map(|digit| if digit <= 2 { 0 } else { digit })
                .as_slice(),
        )
        .unwrap();
        assert!(matches!(
            count_with_completion(
                &ambiguous,
                &computation,
                &completion,
                &mut ExecutionControl::new(),
                100
            )
            .unwrap(),
            SearchResult::Complete { count: 2, .. }
        ));
        partial[0] = 2;
        assert!(
            count_with_completion(
                &Board::try_from(partial.as_slice()).unwrap(),
                &computation,
                &completion,
                &mut ExecutionControl::new(),
                100
            )
            .is_err()
        );
    }
}
