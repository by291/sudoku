use crate::fixtures::decode_puzzle;
use serde::Deserialize;
use serde_json::{Value, json};
use sudoku_core::budget::WorkBudget;
use sudoku_core::editing::{BoardEdit, BoardLayers, EditOutcome, edit_board};
use sudoku_core::rules::context::compile_rules;
use sudoku_core::types::{BOARD_SIZE, Board, CandidateMask, CellIndex, Digit};

type FixtureResult = Result<Value, Box<dyn std::error::Error>>;

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
enum Action {
    Enter {
        cell: usize,
        digit: u8,
    },
    Erase {
        cell: usize,
        #[serde(rename = "digit")]
        _digit: u8,
    },
    ToggleNote {
        cell: usize,
        digit: u8,
    },
    GenerateNotes,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EditingInput {
    puzzle: Value,
    action: Action,
    limit: u64,
}

pub fn evaluate(input: EditingInput) -> FixtureResult {
    let puzzle = decode_puzzle(&input.puzzle)?;
    let rules = compile_rules(&puzzle.rules)?;
    let mut budget = WorkBudget::new(input.limit);
    let before = BoardLayers {
        entries: Board::EMPTY,
        notes: [CandidateMask::EMPTY; BOARD_SIZE],
    };
    let assistance_changed = matches!(input.action, Action::GenerateNotes);
    let action = match input.action {
        Action::Enter { cell, digit } => BoardEdit::Enter {
            cell: CellIndex::try_from(cell)?,
            digit: Digit::try_from(digit)?,
        },
        Action::Erase { cell, .. } => BoardEdit::Erase {
            cell: CellIndex::try_from(cell)?,
        },
        Action::ToggleNote { cell, digit } => BoardEdit::ToggleNote {
            cell: CellIndex::try_from(cell)?,
            digit: Digit::try_from(digit)?,
        },
        Action::GenerateNotes => BoardEdit::GenerateNotes,
    };
    match edit_board(&puzzle.givens, &before, &action, &rules, &mut budget)? {
        EditOutcome::Complete(outcome) => {
            // The legacy session outcome also includes application-owned assistance/no-op policy.
            let changed = outcome.changed || assistance_changed;
            Ok(
                json!({"status":"complete","entries":outcome.layers.entries.values().to_vec(),"notes":outcome.layers.notes.iter().map(|mask|mask.bits()).collect::<Vec<_>>(),"changed":changed,"boardComplete":changed && outcome.board_complete,"workUsed":budget.used()}),
            )
        }
        EditOutcome::BudgetExhausted => Ok(
            json!({"status":"budget-exhausted","entries":before.entries.values().to_vec(),"notes":before.notes.iter().map(|mask|mask.bits()).collect::<Vec<_>>(),"changed":false,"boardComplete":false,"workUsed":budget.used()}),
        ),
    }
}
