use super::logic::step_to_dto;
use super::values::counter;
use crate::dto::rating::UnavailableReasonDto;
use crate::dto::rating::{
    AssessmentOutcomeDto, AssessmentResultDto, AssessmentStageDto, AssessmentSummaryDto,
    WorkloadDto,
};
use sudoku_core::constraints::types::{RuleViolation, ViolationCode};
use sudoku_core::logic::techniques::ALL_TECHNIQUES;
use sudoku_core::rating::types::UnavailableReason;
use sudoku_core::rating::types::{
    AssessmentFailure, AssessmentIssue, AssessmentResult, AssessmentStage, DifficultyAssessment,
};
use sudoku_core::types::CoreResult;

pub fn violation_message(violation: &RuleViolation) -> String {
    match violation.code {
        ViolationCode::Duplicate => "同一行、列、宫、区域、对角线或笼中的数字不能重复。".to_owned(),
        ViolationCode::CageTotal { index, sum } => {
            format!("第{}个笼内数字不能重复，总和必须为{}。", index + 1, sum)
        }
        ViolationCode::ThermoOrder { index } => {
            format!("第{}支温度计的数字必须从圆头开始严格递增。", index + 1)
        }
        ViolationCode::ArrowTotal { index } => {
            format!("第{}条箭头上的数字总和必须等于圆圈内数字。", index + 1)
        }
    }
}

pub fn issue_messages(issues: &[AssessmentIssue]) -> Vec<String> {
    issues
        .iter()
        .map(|issue| match issue {
            AssessmentIssue::Message(message) => message.clone(),
            AssessmentIssue::Violation(violation) => format!(
                "{}: {}",
                violation.constraint_id,
                violation_message(violation)
            ),
        })
        .collect()
}

pub fn summary_to_dto(summary: &DifficultyAssessment) -> CoreResult<AssessmentSummaryDto> {
    let workload = &summary.workload;
    let counts = ALL_TECHNIQUES
        .into_iter()
        .map(|technique| {
            Ok((
                technique.into(),
                counter(workload.technique_counts.count(technique))?,
            ))
        })
        .collect::<CoreResult<_>>()?;
    Ok(AssessmentSummaryDto {
        rating_version: crate::dto::rating::RatingVersionDto::V2,
        variant: summary.variant.into(),
        difficulty: summary.difficulty.into(),
        workload: WorkloadDto {
            steps: counter(workload.steps)?,
            placements: counter(workload.placements)?,
            eliminations: counter(workload.eliminations)?,
            candidate_removals: counter(workload.candidate_removals)?,
            technique_counts: counts,
            highest_tier: workload.highest_tier.map(Into::into),
            highest_technique: workload.highest_technique.map(Into::into),
            variant_steps: counter(workload.variant_steps)?,
        },
    })
}

pub fn assessment_to_dto(result: &AssessmentResult) -> CoreResult<AssessmentResultDto> {
    let outcome = assessment_summary_to_dto(result)?;
    let trace = match result {
        AssessmentResult::Rated(rated) => rated
            .trace
            .iter()
            .map(step_to_dto)
            .collect::<CoreResult<_>>()?,
        AssessmentResult::Unrated(_) => Vec::new(),
    };
    Ok(match outcome {
        AssessmentOutcomeDto::Rated { summary } => AssessmentResultDto::Rated { summary, trace },
        AssessmentOutcomeDto::Ungraded {
            rating_version,
            variant,
        } => AssessmentResultDto::Ungraded {
            rating_version,
            variant,
        },
        AssessmentOutcomeDto::BudgetExhausted {
            rating_version,
            variant,
            stage,
            difficulty,
        } => AssessmentResultDto::BudgetExhausted {
            rating_version,
            variant,
            stage,
            difficulty,
        },
        AssessmentOutcomeDto::Invalid { issues } => AssessmentResultDto::Invalid { issues },
    })
}

pub fn assessment_summary_to_dto(result: &AssessmentResult) -> CoreResult<AssessmentOutcomeDto> {
    Ok(match result {
        AssessmentResult::Rated(rated) => AssessmentOutcomeDto::Rated {
            summary: summary_to_dto(&rated.summary)?,
        },
        AssessmentResult::Unrated(AssessmentFailure::Ungraded { variant }) => {
            AssessmentOutcomeDto::Ungraded {
                rating_version: crate::dto::rating::RatingVersionDto::V2,
                variant: (*variant).into(),
            }
        }
        AssessmentResult::Unrated(AssessmentFailure::BudgetExhausted {
            variant,
            stage,
            difficulty,
        }) => AssessmentOutcomeDto::BudgetExhausted {
            rating_version: crate::dto::rating::RatingVersionDto::V2,
            variant: (*variant).into(),
            stage: match stage {
                AssessmentStage::Validation => AssessmentStageDto::Validation,
                AssessmentStage::Logic => AssessmentStageDto::Logic,
            },
            difficulty: difficulty.map(Into::into),
        },
        AssessmentResult::Unrated(AssessmentFailure::Invalid { issues }) => {
            AssessmentOutcomeDto::Invalid {
                issues: issue_messages(issues),
            }
        }
    })
}
impl From<UnavailableReason> for UnavailableReasonDto {
    fn from(value: UnavailableReason) -> Self {
        match value {
            UnavailableReason::Ungraded => Self::Ungraded,
            UnavailableReason::BudgetExhausted => Self::BudgetExhausted,
            UnavailableReason::InvalidInput => Self::InvalidInput,
            UnavailableReason::InvalidSummary => Self::InvalidSummary,
            UnavailableReason::UnsupportedVersion => Self::UnsupportedVersion,
            UnavailableReason::IdentityMismatch => Self::IdentityMismatch,
        }
    }
}

impl From<UnavailableReasonDto> for UnavailableReason {
    fn from(value: UnavailableReasonDto) -> Self {
        match value {
            UnavailableReasonDto::Ungraded => Self::Ungraded,
            UnavailableReasonDto::BudgetExhausted => Self::BudgetExhausted,
            UnavailableReasonDto::InvalidInput => Self::InvalidInput,
            UnavailableReasonDto::InvalidSummary => Self::InvalidSummary,
            UnavailableReasonDto::UnsupportedVersion => Self::UnsupportedVersion,
            UnavailableReasonDto::IdentityMismatch => Self::IdentityMismatch,
        }
    }
}
