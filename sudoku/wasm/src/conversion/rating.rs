use super::logic::step_to_dto;
use super::values::counter;
use crate::dto::rating::{
    AssessmentResultDto, AssessmentStageDto, AssessmentSummaryDto, WorkloadDto,
};
use sudoku_core::constraints::types::{RuleViolation, ViolationCode};
use sudoku_core::logic::techniques::ALL_TECHNIQUES;
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
    Ok(match result {
        AssessmentResult::Rated(rated) => AssessmentResultDto::Rated {
            summary: summary_to_dto(&rated.summary)?,
            trace: rated
                .trace
                .iter()
                .map(step_to_dto)
                .collect::<CoreResult<_>>()?,
        },
        AssessmentResult::Unrated(AssessmentFailure::Ungraded { variant }) => {
            AssessmentResultDto::Ungraded {
                rating_version: crate::dto::rating::RatingVersionDto::V2,
                variant: (*variant).into(),
            }
        }
        AssessmentResult::Unrated(AssessmentFailure::BudgetExhausted {
            variant,
            stage,
            difficulty,
        }) => AssessmentResultDto::BudgetExhausted {
            rating_version: crate::dto::rating::RatingVersionDto::V2,
            variant: (*variant).into(),
            stage: match stage {
                AssessmentStage::Validation => AssessmentStageDto::Validation,
                AssessmentStage::Logic => AssessmentStageDto::Logic,
            },
            difficulty: difficulty.map(Into::into),
        },
        AssessmentResult::Unrated(AssessmentFailure::Invalid { issues }) => {
            AssessmentResultDto::Invalid {
                issues: issue_messages(issues),
            }
        }
    })
}
