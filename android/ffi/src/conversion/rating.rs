use super::logic::step_to_dto;
use super::values::counter;
use crate::dto::rating::UnavailableReasonDto;
use crate::dto::rating::{
    AssessmentIssueDto, AssessmentResultDto, AssessmentStageDto, AssessmentSummaryDto,
    LiveAssessmentOutcomeDto, WorkloadDto,
};
#[cfg(test)]
use sudoku_core::constraints::types::{RuleViolation, ViolationCode};
use sudoku_core::logic::techniques::ALL_TECHNIQUES;
use sudoku_core::rating::types::UnavailableReason;
use sudoku_core::rating::types::{
    AssessmentFailure, AssessmentIssue, AssessmentResult, AssessmentStage, DifficultyAssessment,
};
use sudoku_core::types::CoreResult;

fn issues_to_dto(issues: &[AssessmentIssue]) -> CoreResult<Vec<AssessmentIssueDto>> {
    issues
        .iter()
        .map(|issue| match issue {
            AssessmentIssue::Message(message) => Ok(AssessmentIssueDto::Message {
                message: message.clone(),
            }),
            AssessmentIssue::Violation(violation) => Ok(AssessmentIssueDto::Violation {
                violation: super::violations::violation_to_dto(violation)?,
            }),
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
        LiveAssessmentOutcomeDto::Rated { summary } => {
            AssessmentResultDto::Rated { summary, trace }
        }
        LiveAssessmentOutcomeDto::Ungraded {
            rating_version,
            variant,
        } => AssessmentResultDto::Ungraded {
            rating_version,
            variant,
        },
        LiveAssessmentOutcomeDto::Incomplete {
            rating_version,
            variant,
            stage,
            difficulty,
        } => AssessmentResultDto::Incomplete {
            rating_version,
            variant,
            stage,
            difficulty,
        },
        LiveAssessmentOutcomeDto::Invalid { issues } => AssessmentResultDto::Invalid { issues },
    })
}

pub fn assessment_summary_to_dto(
    result: &AssessmentResult,
) -> CoreResult<LiveAssessmentOutcomeDto> {
    Ok(match result {
        AssessmentResult::Rated(rated) => LiveAssessmentOutcomeDto::Rated {
            summary: summary_to_dto(&rated.summary)?,
        },
        AssessmentResult::Unrated(AssessmentFailure::Ungraded { variant }) => {
            LiveAssessmentOutcomeDto::Ungraded {
                rating_version: crate::dto::rating::RatingVersionDto::V2,
                variant: (*variant).into(),
            }
        }
        AssessmentResult::Unrated(AssessmentFailure::Incomplete {
            variant,
            stage,
            difficulty,
        }) => LiveAssessmentOutcomeDto::Incomplete {
            rating_version: crate::dto::rating::RatingVersionDto::V2,
            variant: (*variant).into(),
            stage: match stage {
                AssessmentStage::Validation => AssessmentStageDto::Validation,
                AssessmentStage::Logic => AssessmentStageDto::Logic,
            },
            difficulty: difficulty.map(Into::into),
        },
        AssessmentResult::Unrated(AssessmentFailure::Invalid { issues }) => {
            LiveAssessmentOutcomeDto::Invalid {
                issues: issues_to_dto(issues)?,
            }
        }
    })
}
impl From<UnavailableReason> for UnavailableReasonDto {
    fn from(value: UnavailableReason) -> Self {
        match value {
            UnavailableReason::Ungraded => Self::Ungraded,
            UnavailableReason::Incomplete => Self::Incomplete,
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
            UnavailableReasonDto::Incomplete => Self::Incomplete,
            UnavailableReasonDto::InvalidInput => Self::InvalidInput,
            UnavailableReasonDto::InvalidSummary => Self::InvalidSummary,
            UnavailableReasonDto::UnsupportedVersion => Self::UnsupportedVersion,
            UnavailableReasonDto::IdentityMismatch => Self::IdentityMismatch,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_assessments_preserve_order_and_literal_violation_facts() {
        let issues = vec![
            AssessmentIssue::Message("  diagnostic  ".into()),
            AssessmentIssue::Violation(RuleViolation {
                constraint_id: "row:0".into(),
                cells: vec![0, 1],
                code: ViolationCode::Duplicate,
            }),
            AssessmentIssue::Violation(RuleViolation {
                constraint_id: "cage:2".into(),
                cells: vec![12, 3],
                code: ViolationCode::CageTotal { index: 2, sum: 11 },
            }),
            AssessmentIssue::Violation(RuleViolation {
                constraint_id: "thermo:4".into(),
                cells: vec![20, 11, 2],
                code: ViolationCode::ThermoOrder { index: 4 },
            }),
            AssessmentIssue::Violation(RuleViolation {
                constraint_id: "arrow:6".into(),
                cells: vec![30, 21, 12],
                code: ViolationCode::ArrowTotal { index: 6 },
            }),
        ];
        let result = AssessmentResult::Unrated(AssessmentFailure::Invalid { issues });

        let dto = assessment_to_dto(&result).unwrap();
        let json = serde_json::to_value(dto).unwrap();

        assert_eq!(
            json,
            serde_json::json!({ "status": "invalid", "issues": [
            { "kind": "message", "message": "  diagnostic  " },
            { "kind": "violation", "violation": { "constraintId": "row:0", "cells": [0, 1], "code": { "kind": "duplicate" } } },
            { "kind": "violation", "violation": { "constraintId": "cage:2", "cells": [12, 3], "code": { "kind": "cage-total", "index": 2, "sum": 11 } } },
            { "kind": "violation", "violation": { "constraintId": "thermo:4", "cells": [20, 11, 2], "code": { "kind": "thermo-order", "index": 4 } } },
            { "kind": "violation", "violation": { "constraintId": "arrow:6", "cells": [30, 21, 12], "code": { "kind": "arrow-total", "index": 6 } } }
        ] })
        );
    }
}
