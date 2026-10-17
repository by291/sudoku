use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
#[serde(transparent)]
pub struct BoardDto(pub Vec<u8>);
uniffi::custom_type!(BoardDto, Vec<u8>, { lower: |value| value.0, try_lift: |value| Ok(BoardDto(value)) });

#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(transparent)]
pub struct DigitDto(pub u8);
uniffi::custom_type!(DigitDto, u8, { lower: |value| value.0, try_lift: |value| Ok(DigitDto(value)) });

#[derive(Clone, Copy, Serialize, Deserialize, uniffi::Enum)]
#[serde(rename_all = "lowercase")]
pub enum DifficultyDto {
    Easy,
    Medium,
    Hard,
    Expert,
}

#[derive(Clone, Copy, Serialize, Deserialize, uniffi::Enum)]
#[serde(rename_all = "lowercase")]
pub enum VariantDto {
    Classic,
    Diagonal,
    Jigsaw,
    Killer,
    Thermo,
    Arrow,
}

/// Finite deterministic core work limits, measured in algorithm operations rather than milliseconds.
/// `initial_work` includes a caller-supplied prior charge in the returned total.
#[derive(Default, Serialize, Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct WorkOptionsDto {
    #[serde(default)]
    pub max_work: Option<u32>,
    #[serde(default)]
    pub initial_work: Option<u32>,
}

#[derive(Serialize, Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GenerationLimitsDto {
    pub max_layouts: u32,
    pub max_work: u32,
    pub max_steps: u32,
}

#[derive(Serialize, Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AssessmentLimitsDto {
    pub max_work: u32,
    pub max_steps: u32,
}

#[derive(Default, Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SearchOptionsDto {
    #[serde(default)]
    pub max_work: Option<u32>,
    #[serde(default)]
    pub node_limit: Option<u32>,
    #[serde(default)]
    pub initial_work: Option<u32>,
}
