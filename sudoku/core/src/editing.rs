//! Pure board-layer edits. Callers own session history, assistance, clocks and completion records.

use crate::board::is_complete;
use crate::constraints::candidates::evaluate_candidates;
use crate::control::ExecutionControl;
use crate::rules::types::PreparedRules;
use crate::types::{BOARD_SIZE, Board, Bounded, CandidateMask, CellIndex, CoreResult, Digit};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BoardLayers {
    pub entries: Board,
    pub notes: [CandidateMask; BOARD_SIZE],
}

#[derive(Clone, Copy, Debug)]
pub enum BoardEdit {
    Enter { cell: CellIndex, digit: Digit },
    Erase { cell: CellIndex },
    ToggleNote { cell: CellIndex, digit: Digit },
    GenerateNotes,
}

#[derive(Clone, Debug)]
pub struct EditResult {
    pub layers: BoardLayers,
    /// Whether board layers changed; callers independently record assistance and history.
    pub changed: bool,
    pub board_complete: bool,
}

#[derive(Clone, Debug)]
pub enum EditOutcome {
    Complete(Box<EditResult>),
    Incomplete,
}

struct EditContext<'edit> {
    givens: &'edit Board,
    before: &'edit BoardLayers,
    rules: &'edit PreparedRules,
}

impl EditContext<'_> {
    fn unchanged(&self) -> EditOutcome {
        complete_edit(self, self.before.clone())
    }
}

/// Merge player entries with givens, which take precedence wherever they are present.
pub fn merged_board(givens: &Board, layers: &BoardLayers) -> Board {
    Board::from_computed_values(std::array::from_fn(|cell| {
        if givens.values()[cell] == 0 {
            layers.entries.values()[cell]
        } else {
            givens.values()[cell]
        }
    }))
}

fn complete_edit(context: &EditContext<'_>, layers: BoardLayers) -> EditOutcome {
    let changed = *context.before != layers;
    let board_complete = is_complete(&merged_board(context.givens, &layers), context.rules);

    EditOutcome::Complete(Box::new(EditResult {
        layers,
        changed,
        board_complete,
    }))
}

/// Return owned layers atomically. Incomplete note generation never changes the caller's layers.
pub fn edit_board(
    givens: &Board,
    before: &BoardLayers,
    edit: &BoardEdit,
    rules: &PreparedRules,
    control: &mut ExecutionControl,
) -> CoreResult<EditOutcome> {
    let context = EditContext {
        givens,
        before,
        rules,
    };
    let cell = match edit {
        BoardEdit::Enter { cell, .. }
        | BoardEdit::Erase { cell }
        | BoardEdit::ToggleNote { cell, .. } => Some(cell.value()),
        BoardEdit::GenerateNotes => None,
    };

    if cell.is_some_and(|cell| givens.values()[cell] != 0) {
        return Ok(context.unchanged());
    }

    let mut entries = *before.entries.values();
    let mut notes = before.notes;

    match *edit {
        BoardEdit::Enter { cell, digit } => {
            let cell = cell.value();
            if entries[cell] == digit.value() {
                return Ok(context.unchanged());
            }

            entries[cell] = digit.value();
            notes[cell] = CandidateMask::EMPTY;

            // Only duplicate peers exclude this digit directly. GenerateNotes handles support.
            let bit = 1 << (digit.value() - 1);
            for &peer in &rules.context().duplicate_peers[cell] {
                notes[peer] = CandidateMask::from_computed_bits(notes[peer].bits() & !bit);
            }
        }
        BoardEdit::Erase { cell } => {
            entries[cell.value()] = 0;
            notes[cell.value()] = CandidateMask::EMPTY;
        }
        BoardEdit::ToggleNote { cell, digit } => {
            let cell = cell.value();
            if entries[cell] != 0 {
                return Ok(context.unchanged());
            }

            notes[cell] =
                CandidateMask::from_computed_bits(notes[cell].bits() ^ (1 << (digit.value() - 1)));
        }
        BoardEdit::GenerateNotes => {
            let Bounded::Complete(candidates) =
                evaluate_candidates(&merged_board(givens, before), rules, control)
            else {
                return Ok(EditOutcome::Incomplete);
            };

            notes = candidates;
        }
    }

    let after = BoardLayers {
        entries: Board::from_computed_values(entries),
        notes,
    };
    Ok(complete_edit(&context, after))
}
