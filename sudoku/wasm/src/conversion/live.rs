use crate::dto::operations::{
    ConflictComputationDto, ConflictResultDto, EditComputationDto, EditResultDto,
};
use crate::dto::values::UntrustedValueDto;
use crate::js_error;
use sudoku_core::types::{BOARD_SIZE, Board, CandidateMask, EngineError};
use tsify::{Ts, Tsify};
use wasm_bindgen::prelude::*;

/// Decode a live conflict envelope and validate each violation's cell bounds.
#[wasm_bindgen]
pub fn parse_conflicts(
    value: Ts<UntrustedValueDto>,
) -> Result<Ts<ConflictComputationDto>, JsError> {
    let value: ConflictComputationDto = serde_wasm_bindgen::from_value(value.to_rust()?.0)?;

    let violations = match &value.0.result {
        ConflictResultDto::Complete { violations }
        | ConflictResultDto::Incomplete { violations } => violations,
    };

    const BOARD_CELL_COUNT: u32 = BOARD_SIZE as u32;
    for violation in violations {
        if violation.constraint_id.is_empty()
            || violation.cells.is_empty()
            || violation.cells.len() > BOARD_SIZE
            || violation.cells.iter().any(|&cell| cell >= BOARD_CELL_COUNT)
        {
            return Err(JsError::new("Invalid conflict cells or identity"));
        }
    }

    Ok(value.into_ts()?)
}

/// Decode a live edit envelope and validate any returned board and note layers.
#[wasm_bindgen]
pub fn parse_edit(value: Ts<UntrustedValueDto>) -> Result<Ts<EditComputationDto>, JsError> {
    let value: EditComputationDto = serde_wasm_bindgen::from_value(value.to_rust()?.0)?;
    if let EditResultDto::Complete { entries, notes, .. } = &value.0.result {
        Board::try_from(entries.0.as_slice()).map_err(js_error)?;
        if notes.len() != BOARD_SIZE {
            return Err(JsError::new(&format!(
                "Notes require exactly {BOARD_SIZE} masks"
            )));
        }
        for &mask in notes {
            CandidateMask::try_from(mask)
                .map_err(|_: EngineError| JsError::new("Invalid note mask"))?;
        }
    }

    Ok(value.into_ts()?)
}
