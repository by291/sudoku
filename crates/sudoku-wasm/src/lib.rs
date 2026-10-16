#![forbid(unsafe_code)]

mod dto;

use dto::EngineInfo;
use sudoku_core::generation::types::{PUZZLE_VERSION, VARIANT_PUZZLE_VERSION};
use sudoku_core::rating::types::RATING_VERSION;
use tsify::{Ts, Tsify};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn engine_info() -> Result<Ts<EngineInfo>, JsError> {
    Ok(EngineInfo {
        bridge_version: 1,
        puzzle_version: PUZZLE_VERSION,
        variant_puzzle_version: VARIANT_PUZZLE_VERSION,
        rating_version: RATING_VERSION,
    }
    .into_ts()?)
}
