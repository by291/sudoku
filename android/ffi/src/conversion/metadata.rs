//! Convert historical native metadata without regrading the saved puzzle.
use crate::dto::rating::{
    AssessmentIdentityDto, AssessmentSummaryDto, AssessmentValidationDto, PuzzleAssessmentDto,
    StoredAssessmentDto,
};
use sudoku_core::rating::types::{
    AssessmentIdentity, DifficultyAssessment, PuzzleAssessment, ReasoningWorkload,
    StoredAssessment, TechniqueCounts,
};
use sudoku_core::types::CoreResult;

fn summary_to_core(value: AssessmentSummaryDto) -> CoreResult<DifficultyAssessment> {
    let source = value.workload;
    let entries: Vec<_> = source
        .technique_counts
        .into_iter()
        .map(|(technique, count)| (technique.into(), u64::from(count)))
        .collect();

    Ok(DifficultyAssessment {
        variant: value.variant.into(),
        difficulty: value.difficulty.into(),
        workload: ReasoningWorkload {
            steps: u64::from(source.steps),
            placements: u64::from(source.placements),
            eliminations: u64::from(source.eliminations),
            candidate_removals: u64::from(source.candidate_removals),
            technique_counts: TechniqueCounts::from_entries(&entries)?,
            highest_tier: source.highest_tier.map(Into::into),
            highest_technique: source.highest_technique.map(Into::into),
            variant_steps: u64::from(source.variant_steps),
        },
    })
}

pub(crate) fn decode(
    value: Option<StoredAssessmentDto>,
    identity: AssessmentIdentityDto,
) -> CoreResult<AssessmentValidationDto> {
    let stored = value.map(|value| match value {
        StoredAssessmentDto::Rated {
            rating_version,
            summary: value,
        } => StoredAssessment::Rated {
            rating_version,
            summary: value
                .ok_or_else(|| vec!["Invalid assessment summary".into()])
                .and_then(|value| summary_to_core(value).map_err(|error| vec![error.to_string()])),
        },
        StoredAssessmentDto::Unavailable { reason, issues } => StoredAssessment::Unavailable {
            reason: reason.into(),
            issues,
        },
        StoredAssessmentDto::Malformed { issues } => StoredAssessment::Malformed { issues },
    });

    // Version rejection remains the decoder's first decision, even for a malformed summary.
    let decoded = sudoku_core::rating::decoding::decode_puzzle_assessment(
        stored.as_ref(),
        AssessmentIdentity {
            variant: identity.variant.into(),
            difficulty: identity.difficulty.into(),
        },
    );

    Ok(match decoded {
        None => AssessmentValidationDto::Absent,
        Some(PuzzleAssessment::Rated(summary)) => AssessmentValidationDto::Present {
            value: PuzzleAssessmentDto::Rated {
                summary: super::rating::summary_to_dto(&summary)?,
            },
        },
        Some(PuzzleAssessment::Unavailable { reason, issues }) => {
            AssessmentValidationDto::Present {
                value: PuzzleAssessmentDto::Unavailable {
                    reason: reason.into(),
                    issues,
                },
            }
        }
    })
}
