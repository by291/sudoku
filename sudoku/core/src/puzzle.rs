use crate::board::is_complete;
use crate::control::ExecutionControl;
use crate::rules::context::{compile_rules, prepare_rules};
use crate::rules::types::{PreparedRules, PuzzleRules, SudokuVariant};
use crate::types::{Board, Bounded, CoreResult, Difficulty, EngineError};

/// Mathematical snapshot content; historical seed/version metadata stays with its storage owner.
#[derive(Clone, Debug)]
pub struct Puzzle {
    pub givens: Board,
    pub solution: Board,
    pub rules: PuzzleRules,
    pub difficulty: Difficulty,
}

fn validate_difficulty(puzzle: &Puzzle) -> CoreResult<()> {
    if puzzle.difficulty == Difficulty::Expert && puzzle.rules.variant() != SudokuVariant::Classic {
        return Err(EngineError::invalid(
            "Expert difficulty is supported only for Classic",
        ));
    }
    Ok(())
}

fn validate_prepared_content(puzzle: &Puzzle, prepared: &PreparedRules) -> CoreResult<()> {
    if !is_complete(&puzzle.solution, prepared)
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

/// Validate stored facts without regenerating, regrading or proving uniqueness.
/// Native callers may choose this unbounded convenience API.
pub fn validate_puzzle(puzzle: &Puzzle) -> CoreResult<()> {
    validate_difficulty(puzzle)?;
    let prepared = compile_rules(&puzzle.rules)?;
    validate_prepared_content(puzzle, &prepared)
}

/// Incomplete preparation cannot classify a stored snapshot as corrupt; no partial layout escapes.
pub fn validate_puzzle_bounded(
    puzzle: &Puzzle,
    control: &mut ExecutionControl,
) -> CoreResult<Bounded<()>> {
    validate_difficulty(puzzle)?;
    let Bounded::Complete(prepared) = prepare_rules(&puzzle.rules, control)? else {
        return Ok(Bounded::Cancelled);
    };
    validate_prepared_content(puzzle, &prepared)?;
    Ok(Bounded::Complete(()))
}
