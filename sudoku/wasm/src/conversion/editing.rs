//! Validate platform edit data before the prepared handle starts an operation.
use crate::dto::operations::{BoardEditDto, EditInputDto};
use sudoku_core::editing::{BoardEdit, BoardLayers};
use sudoku_core::types::{
    BOARD_SIZE, Board, CandidateMask, CellIndex, CoreResult, Digit, EngineError,
};

pub(crate) struct PreparedEditInput {
    pub givens: Board,
    pub before: BoardLayers,
    pub action: BoardEdit,
}

impl TryFrom<EditInputDto> for PreparedEditInput {
    type Error = EngineError;

    fn try_from(input: EditInputDto) -> CoreResult<Self> {
        let givens: Board = input.givens.try_into()?;
        let entries: Board = input.entries.try_into()?;

        let note_count = input.notes.len();
        let mut notes = [CandidateMask::EMPTY; BOARD_SIZE];
        // Validate every supplied mask, including excess masks, before reporting a length error.
        for (index, bits) in input.notes.into_iter().enumerate() {
            let mask = CandidateMask::try_from(bits)?;
            if let Some(destination) = notes.get_mut(index) {
                *destination = mask;
            }
        }
        if note_count != BOARD_SIZE {
            return Err(EngineError::invalid("Notes require exactly 81 masks"));
        }
        let before = BoardLayers { entries, notes };

        let cell = |value: u32| {
            CellIndex::try_from(
                usize::try_from(value)
                    .map_err(|_| EngineError::invalid("Edit cell exceeds platform bounds"))?,
            )
        };
        let action = match input.action {
            BoardEditDto::Enter { cell: index, digit } => BoardEdit::Enter {
                cell: cell(index)?,
                digit: Digit::try_from(digit.0)?,
            },
            BoardEditDto::Erase { cell: index } => BoardEdit::Erase { cell: cell(index)? },
            BoardEditDto::ToggleNote { cell: index, digit } => BoardEdit::ToggleNote {
                cell: cell(index)?,
                digit: Digit::try_from(digit.0)?,
            },
            BoardEditDto::GenerateNotes => BoardEdit::GenerateNotes,
        };

        Ok(Self {
            givens,
            before,
            action,
        })
    }
}
