use crate::dto::operations::{
    ConflictComputationDto, ConflictResultDto, EditComputationDto, EditResultDto,
};
use crate::dto::values::UntrustedValueDto;
use crate::js_error;
use sudoku_core::types::{Board, CandidateMask, EngineError};
use tsify::{Ts, Tsify};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn parse_conflicts(
    value: Ts<UntrustedValueDto>,
) -> Result<Ts<ConflictComputationDto>, JsError> {
    let value: ConflictComputationDto = serde_wasm_bindgen::from_value(value.to_rust()?.0)?;
    let (ConflictResultDto::Complete { violations } | ConflictResultDto::Incomplete { violations }) =
        &value.0.result;
    for violation in violations {
        if violation.constraint_id.is_empty()
            || violation.cells.is_empty()
            || violation.cells.len() > 81
            || violation.cells.iter().any(|&cell| cell >= 81)
        {
            return Err(JsError::new("Invalid conflict cells or identity"));
        }
    }
    Ok(value.into_ts()?)
}

#[wasm_bindgen]
pub fn parse_edit(value: Ts<UntrustedValueDto>) -> Result<Ts<EditComputationDto>, JsError> {
    let value: EditComputationDto = serde_wasm_bindgen::from_value(value.to_rust()?.0)?;
    if let EditResultDto::Complete { entries, notes, .. } = &value.0.result {
        Board::try_from(entries.0.as_slice()).map_err(js_error)?;
        if notes.len() != 81 {
            return Err(JsError::new("Notes require exactly 81 masks"));
        }
        for &mask in notes {
            CandidateMask::try_from(mask)
                .map_err(|_: EngineError| JsError::new("Invalid note mask"))?;
        }
    }
    Ok(value.into_ts()?)
}
