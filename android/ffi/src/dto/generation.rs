use std::collections::HashMap;

use super::rating::AssessmentSummaryDto;
use super::rules::RulesDto;
use super::values::{BoardDto, DifficultyDto, GenerationLimitsDto, VariantDto};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Serialize, Deserialize, uniffi::Enum)]
pub enum GenerationVersionDto {
    #[serde(rename = "sudoku-v11")]
    ClassicV11,
    #[serde(rename = "sudoku-variants-v11")]
    VariantsV11,
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

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, uniffi::Enum)]
#[serde(rename_all = "lowercase")]
pub enum WorkStageDto {
    Preparation,
    Arithmetic,
    Exact,
    Logic,
    Proposals,
}

#[derive(Serialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct GenerationMetricsDto {
    pub construction_work: u32,
    pub layouts: u32,
    pub completed_layouts: u32,
    pub candidate_visits: u32,
    // Metrics always include all exclusive work stages, even when unused.
    pub work_by_stage: HashMap<WorkStageDto, u32>,
}

#[derive(Serialize, uniffi::Enum)]
#[serde(rename_all = "kebab-case")]
pub enum GenerationExhaustionDto {
    WorkLimit,
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
    BudgetExhausted {
        stage: GenerationStageDto,
        cause: GenerationExhaustionDto,
        metrics: GenerationMetricsDto,
    },
    Failed {
        reason: String,
        metrics: GenerationMetricsDto,
    },
}
