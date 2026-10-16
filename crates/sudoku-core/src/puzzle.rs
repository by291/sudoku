use crate::board::is_complete;
use crate::rules::context::compile_rules;
use crate::rules::types::{PuzzleRules, SudokuVariant};
use crate::types::{Board, CoreResult, Difficulty, EngineError};

/// Mathematical snapshot content; historical seed/version metadata stays with its storage owner.
#[derive(Clone, Debug)]
pub struct Puzzle {
    pub givens: Board,
    pub solution: Board,
    pub rules: PuzzleRules,
    pub difficulty: Difficulty,
}

/// Validate stored facts without regenerating, regrading or proving uniqueness.
pub fn validate_puzzle(puzzle: &Puzzle) -> CoreResult<()> {
    if puzzle.difficulty == Difficulty::Expert && puzzle.rules.variant() != SudokuVariant::Classic {
        return Err(EngineError::invalid(
            "Expert difficulty is supported only for Classic",
        ));
    }

    let prepared = compile_rules(&puzzle.rules)?;
    if !is_complete(&puzzle.solution, &prepared)
        || puzzle
            .givens
            .values()
            .iter()
            .zip(puzzle.solution.values())
            .any(|(&given, &solution)| given != 0 && given != solution)
    {
        return Err(EngineError::invalid(
            "Solution does not satisfy puzzle givens",
        ));
    }

    Ok(())
}
