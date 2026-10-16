use std::collections::BTreeMap;

use super::rating::AssessmentSummaryDto;
use super::rules::RulesDto;
use super::values::{BoardDto, DifficultyDto, GenerationLimitsDto, VariantDto};
use serde::{Deserialize, Serialize};
use tsify::Tsify;

#[derive(Clone, Copy, Serialize, Deserialize, Tsify)]
pub enum GenerationVersionDto {
    #[serde(rename = "sudoku-v11")]
    ClassicV11,
    #[serde(rename = "sudoku-variants-v11")]
    VariantsV11,
}

#[derive(Deserialize, Tsify)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GenerationOptionsDto {
    pub variant: VariantDto,
    pub difficulty: DifficultyDto,
    pub puzzle_version: GenerationVersionDto,
    #[serde(default)]
    pub limits: Option<GenerationLimitsDto>,
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedPuzzleDto {
    pub givens: BoardDto,
    pub solution: BoardDto,
    pub rules: RulesDto,
    pub difficulty: DifficultyDto,
    pub seed: String,
    pub puzzle_version: GenerationVersionDto,
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct GenerationMetricsDto {
    pub construction_work: u32,
    pub layouts: u32,
    pub completed_layouts: u32,
    pub candidate_visits: u32,
    pub work_by_stage: BTreeMap<String, u32>,
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "kebab-case")]
pub enum GenerationExhaustionDto {
    WorkLimit,
    LogicalStepLimit,
    LayoutLimit,
    ExhaustedFrontier,
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "lowercase")]
pub enum GeneratedSourceDto {
    Generated,
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "lowercase")]
pub enum GenerationStageDto {
    Construction,
}

#[derive(Serialize, Tsify)]
#[serde(tag = "status", rename_all = "kebab-case")]
#[tsify(hashmap_as_object, missing_as_null)]
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
