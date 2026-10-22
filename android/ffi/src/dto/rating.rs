use std::collections::HashMap;

use super::logic::{LogicalStepDto, TechniqueDto};
use super::operations::ViolationDto;
use super::rules::RulesDto;
use super::values::{AssessmentLimitsDto, BoardDto, DifficultyDto, VariantDto};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Serialize, Deserialize, uniffi::Enum)]
pub enum RatingVersionDto {
    #[serde(rename = "sudoku-rating-v2")]
    V2,
}

#[derive(Clone, Serialize, Deserialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct WorkloadDto {
    pub steps: u32,
    pub placements: u32,
    pub eliminations: u32,
    pub candidate_removals: u32,
    // Conversion emits every known technique, including zero counts.
    pub technique_counts: HashMap<TechniqueDto, u32>,
    pub highest_tier: Option<DifficultyDto>,
    pub highest_technique: Option<TechniqueDto>,
    pub variant_steps: u32,
}

#[derive(Clone, Serialize, Deserialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct AssessmentSummaryDto {
    pub rating_version: RatingVersionDto,
    pub variant: VariantDto,
    pub difficulty: DifficultyDto,
    pub workload: WorkloadDto,
}

#[derive(Clone, Copy, Serialize, Deserialize, uniffi::Enum)]
#[serde(rename_all = "kebab-case")]
pub enum ExhaustionCauseDto {
    Cancelled,
    LogicalStepLimit,
}

#[derive(Clone, Copy, Serialize, Deserialize, uniffi::Enum)]
#[serde(rename_all = "lowercase")]
pub enum AssessmentStageDto {
    Validation,
    Logic,
}

/// Owned newly computed diagnostics; clients own player-facing rendering.
#[derive(Serialize, uniffi::Enum)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum AssessmentIssueDto {
    Message { message: String },
    Violation { violation: ViolationDto },
}

#[derive(Serialize, uniffi::Enum)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum AssessmentResultDto {
    Rated {
        summary: AssessmentSummaryDto,
        trace: Vec<LogicalStepDto>,
    },
    Ungraded {
        #[serde(rename = "ratingVersion")]
        rating_version: RatingVersionDto,
        variant: VariantDto,
    },
    Incomplete {
        #[serde(rename = "ratingVersion")]
        rating_version: RatingVersionDto,
        variant: VariantDto,
        stage: AssessmentStageDto,
        difficulty: Option<DifficultyDto>,
    },
    Invalid {
        issues: Vec<AssessmentIssueDto>,
    },
}

#[derive(Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AssessmentInputDto {
    pub board: BoardDto,
    pub rules: RulesDto,
    #[serde(default)]
    pub rating_version: Option<String>,
    #[serde(default)]
    pub limits: Option<AssessmentLimitsDto>,
}

/// Expected variant and difficulty for stored metadata; this does not identify a board or seed.
#[derive(Serialize, Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields)]
pub struct AssessmentIdentityDto {
    pub variant: VariantDto,
    pub difficulty: DifficultyDto,
}

#[derive(Clone, Copy, Serialize, Deserialize, uniffi::Enum)]
#[serde(rename_all = "kebab-case")]
pub enum UnavailableReasonDto {
    Ungraded,
    #[serde(alias = "budget-exhausted")]
    Incomplete,
    InvalidInput,
    InvalidSummary,
    UnsupportedVersion,
    IdentityMismatch,
}

#[derive(Serialize, uniffi::Enum)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum PuzzleAssessmentDto {
    Rated {
        summary: AssessmentSummaryDto,
    },
    Unavailable {
        reason: UnavailableReasonDto,
        issues: Vec<String>,
    },
}

#[derive(Serialize, uniffi::Enum)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum AssessmentValidationDto {
    Absent,
    Present { value: PuzzleAssessmentDto },
}

/// Newly computed summary-only outcomes retain structured invalid-input facts.
#[derive(Serialize, uniffi::Enum)]
#[serde(tag = "status", rename_all = "kebab-case", deny_unknown_fields)]
pub enum LiveAssessmentOutcomeDto {
    Rated {
        summary: AssessmentSummaryDto,
    },
    Ungraded {
        #[serde(rename = "ratingVersion")]
        rating_version: RatingVersionDto,
        variant: VariantDto,
    },
    Incomplete {
        #[serde(rename = "ratingVersion")]
        rating_version: RatingVersionDto,
        variant: VariantDto,
        stage: AssessmentStageDto,
        difficulty: Option<DifficultyDto>,
    },
    Invalid {
        issues: Vec<AssessmentIssueDto>,
    },
}

/// Historical string-shaped compatibility outcome; live computation uses LiveAssessmentOutcomeDto.
#[derive(Serialize, uniffi::Enum)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum AssessmentOutcomeDto {
    Rated {
        summary: AssessmentSummaryDto,
    },
    Ungraded {
        #[serde(rename = "ratingVersion")]
        rating_version: RatingVersionDto,
        variant: VariantDto,
    },
    Incomplete {
        #[serde(rename = "ratingVersion")]
        rating_version: RatingVersionDto,
        variant: VariantDto,
        stage: AssessmentStageDto,
        difficulty: Option<DifficultyDto>,
    },
    Invalid {
        issues: Vec<String>,
    },
}

/// Historical envelope versions stay explicit and are validated before current summaries.
#[derive(uniffi::Enum)]
pub enum StoredAssessmentDto {
    Rated {
        rating_version: String,
        summary: Option<AssessmentSummaryDto>,
    },
    Unavailable {
        reason: UnavailableReasonDto,
        issues: Vec<String>,
    },
    Malformed {
        issues: Vec<String>,
    },
}
