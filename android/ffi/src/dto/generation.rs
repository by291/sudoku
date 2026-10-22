use super::rating::AssessmentSummaryDto;
use super::rules::RulesDto;
use super::values::{BoardDto, DifficultyDto, GenerationLimitsDto, VariantDto};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Serialize, Deserialize, uniffi::Enum)]
pub enum GenerationVersionDto {
    #[serde(rename = "sudoku-v12")]
    ClassicV12,
    #[serde(rename = "sudoku-variants-v12")]
    VariantsV12,
}

#[derive(Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GenerationOptionsDto {
    pub variant: VariantDto,
    pub difficulty: DifficultyDto,
    pub puzzle_version: GenerationVersionDto,
    #[serde(default)]
    pub limits: Option<GenerationLimitsDto>,
}

#[derive(Serialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedPuzzleDto {
    pub givens: BoardDto,
    pub solution: BoardDto,
    pub rules: RulesDto,
    pub difficulty: DifficultyDto,
    pub seed: String,
    pub puzzle_version: GenerationVersionDto,
}

#[derive(Serialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct GenerationMetricsDto {
    pub layouts: u32,
    pub completed_layouts: u32,
    pub candidate_visits: u32,
}

#[derive(Serialize, uniffi::Enum)]
#[serde(rename_all = "kebab-case")]
pub enum GenerationExhaustionDto {
    Cancelled,
    LogicalStepLimit,
    LayoutLimit,
    ExhaustedFrontier,
}

#[derive(Serialize, uniffi::Enum)]
#[serde(rename_all = "lowercase")]
pub enum GeneratedSourceDto {
    Generated,
}

#[derive(Serialize, uniffi::Enum)]
#[serde(rename_all = "lowercase")]
pub enum GenerationStageDto {
    Construction,
}

#[derive(Serialize, uniffi::Enum)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum GenerationResultDto {
    Ready {
        puzzle: GeneratedPuzzleDto,
        source: GeneratedSourceDto,
        assessment: AssessmentSummaryDto,
        metrics: GenerationMetricsDto,
    },
    Incomplete {
        stage: GenerationStageDto,
        cause: GenerationExhaustionDto,
        metrics: GenerationMetricsDto,
    },
    Failed {
        reason: String,
        metrics: GenerationMetricsDto,
    },
}
