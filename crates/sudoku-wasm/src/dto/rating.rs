use std::collections::BTreeMap;

use super::logic::{LogicalStepDto, TechniqueDto};
use super::rules::RulesDto;
use super::values::{AssessmentLimitsDto, BoardDto, DifficultyDto, VariantDto};
use serde::{Deserialize, Serialize};
use tsify::Tsify;
use wasm_bindgen::JsValue;

#[derive(Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct WorkloadDto {
    pub steps: u32,
    pub placements: u32,
    pub eliminations: u32,
    pub candidate_removals: u32,
    pub technique_counts: BTreeMap<TechniqueDto, u32>,
    pub highest_tier: Option<DifficultyDto>,
    pub highest_technique: Option<TechniqueDto>,
    pub variant_steps: u32,
}

#[derive(Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct AssessmentSummaryDto {
    pub rating_version: String,
    pub variant: VariantDto,
    pub difficulty: DifficultyDto,
    pub workload: WorkloadDto,
}

#[derive(Clone, Copy, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "kebab-case")]
pub enum ExhaustionCauseDto {
    WorkLimit,
    LogicalStepLimit,
}

#[derive(Clone, Copy, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "lowercase")]
pub enum AssessmentStageDto {
    Validation,
    Logic,
}

#[derive(Serialize, Tsify)]
#[serde(tag = "status", rename_all = "kebab-case")]
#[tsify(hashmap_as_object, missing_as_null)]
pub enum AssessmentResultDto {
    Rated {
        summary: AssessmentSummaryDto,
        trace: Vec<LogicalStepDto>,
    },
    Ungraded {
        #[serde(rename = "ratingVersion")]
        rating_version: String,
        variant: VariantDto,
    },
    BudgetExhausted {
        #[serde(rename = "ratingVersion")]
        rating_version: String,
        variant: VariantDto,
        stage: AssessmentStageDto,
        difficulty: Option<DifficultyDto>,
    },
    Invalid {
        issues: Vec<String>,
    },
}

#[derive(Deserialize, Tsify)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AssessmentInputDto {
    pub board: BoardDto,
    pub rules: RulesDto,
    #[serde(default)]
    pub rating_version: Option<String>,
    #[serde(default)]
    pub limits: Option<AssessmentLimitsDto>,
    #[serde(default)]
    pub max_work: Option<u32>,
    #[serde(default)]
    pub initial_work: Option<u32>,
}

#[derive(Serialize, Deserialize, Tsify)]
#[serde(deny_unknown_fields)]
pub struct AssessmentIdentityDto {
    pub variant: VariantDto,
    pub difficulty: DifficultyDto,
}

#[derive(Deserialize, Tsify)]
#[serde(deny_unknown_fields)]
pub struct AssessmentValidationInputDto {
    pub present: bool,
    #[serde(with = "serde_wasm_bindgen::preserve")]
    #[tsify(type = "unknown")]
    pub value: JsValue,
    pub identity: AssessmentIdentityDto,
}

#[derive(Clone, Copy, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "kebab-case")]
pub enum UnavailableReasonDto {
    Ungraded,
    BudgetExhausted,
    InvalidInput,
    InvalidSummary,
    UnsupportedVersion,
    IdentityMismatch,
}

#[derive(Serialize, Tsify)]
#[serde(tag = "status", rename_all = "lowercase")]
#[tsify(hashmap_as_object, missing_as_null)]
pub enum PuzzleAssessmentDto {
    Rated {
        summary: AssessmentSummaryDto,
    },
    Unavailable {
        reason: UnavailableReasonDto,
        issues: Vec<String>,
    },
}

#[derive(Serialize, Tsify)]
#[serde(tag = "status", rename_all = "kebab-case")]
#[tsify(hashmap_as_object, missing_as_null)]
pub enum AssessmentValidationDto {
    Absent,
    Present { value: PuzzleAssessmentDto },
}

/// Stored outcomes omit the transient deduction trace.
#[derive(Serialize, Tsify)]
#[serde(tag = "status", rename_all = "kebab-case")]
#[tsify(hashmap_as_object, missing_as_null)]
pub enum AssessmentOutcomeDto {
    Rated {
        summary: AssessmentSummaryDto,
    },
    Ungraded {
        #[serde(rename = "ratingVersion")]
        rating_version: String,
        variant: VariantDto,
    },
    BudgetExhausted {
        #[serde(rename = "ratingVersion")]
        rating_version: String,
        variant: VariantDto,
        stage: AssessmentStageDto,
        difficulty: Option<DifficultyDto>,
    },
    Invalid {
        issues: Vec<String>,
    },
}

#[derive(Serialize, Tsify)]
#[serde(untagged)]
#[tsify(hashmap_as_object, missing_as_null)]
pub enum ParsedAssessmentDto<T> {
    Valid {
        #[tsify(type = "true")]
        valid: bool,
        value: T,
    },
    Invalid {
        #[tsify(type = "false")]
        valid: bool,
        issues: Vec<String>,
    },
}

#[derive(Serialize, Tsify)]
#[serde(transparent)]
#[tsify(hashmap_as_object, missing_as_null)]
pub struct ParsedSummaryDto(pub ParsedAssessmentDto<AssessmentSummaryDto>);

#[derive(Serialize, Tsify)]
#[serde(transparent)]
#[tsify(hashmap_as_object, missing_as_null)]
pub struct ParsedOutcomeDto(pub ParsedAssessmentDto<AssessmentOutcomeDto>);

#[derive(Deserialize, Tsify)]
#[serde(transparent)]
#[tsify(type = "unknown")]
pub struct RawAssessmentDto(#[serde(with = "serde_wasm_bindgen::preserve")] pub JsValue);
