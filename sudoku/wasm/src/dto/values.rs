use serde::{Deserialize, Serialize};
use tsify::Tsify;

#[derive(Clone, Serialize, Deserialize, Tsify)]
#[serde(transparent)]
#[tsify(type = "(0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9)[]")]
pub struct BoardDto(pub Vec<u8>);

#[derive(Clone, Copy, Serialize, Deserialize, Tsify)]
#[serde(transparent)]
#[tsify(type = "1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9")]
pub struct DigitDto(pub u8);

#[derive(Clone, Copy, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "lowercase")]
pub enum DifficultyDto {
    Easy,
    Medium,
    Hard,
    Expert,
}

#[derive(Clone, Copy, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "lowercase")]
pub enum VariantDto {
    Classic,
    Diagonal,
    Jigsaw,
    Killer,
    Thermo,
    Arrow,
}

#[derive(Serialize, Deserialize, Tsify)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GenerationLimitsDto {
    pub max_layouts: u32,
    pub max_steps: u32,
}

#[derive(Serialize, Deserialize, Tsify)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AssessmentLimitsDto {
    pub max_steps: u32,
}

#[derive(Default, Deserialize, Tsify)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SearchOptionsDto {
    #[serde(default)]
    pub node_limit: Option<u32>,
}

/// Semantic validators accept untrusted JS values, then decode their explicit DTO before computation.
#[derive(Deserialize, Tsify)]
#[serde(transparent)]
#[tsify(type = "unknown")]
pub struct UntrustedValueDto(
    #[serde(with = "serde_wasm_bindgen::preserve")] pub wasm_bindgen::JsValue,
);
