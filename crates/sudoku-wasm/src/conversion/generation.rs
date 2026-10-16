use super::rating::summary_to_dto;
use super::rules::rules_to_dto;
use super::values::counter;
use crate::dto::generation::{
    GeneratedPuzzleDto, GeneratedSourceDto, GenerationExhaustionDto, GenerationMetricsDto,
    GenerationOptionsDto, GenerationResultDto, GenerationStageDto, GenerationVersionDto,
    WorkStageDto,
};
use sudoku_core::budget::WorkStage;
use sudoku_core::generation::types::{
    GenerationInput, GenerationLimits, GenerationOutcome, GenerationResult, GenerationVersion,
};
use sudoku_core::random::Seed;
use sudoku_core::types::CoreResult;

impl From<GenerationVersionDto> for GenerationVersion {
    fn from(value: GenerationVersionDto) -> Self {
        match value {
            GenerationVersionDto::ClassicV11 => Self::ClassicV11,
            GenerationVersionDto::VariantsV11 => Self::VariantsV11,
        }
    }
}
impl From<GenerationVersion> for GenerationVersionDto {
    fn from(value: GenerationVersion) -> Self {
        match value {
            GenerationVersion::ClassicV11 => Self::ClassicV11,
            GenerationVersion::VariantsV11 => Self::VariantsV11,
        }
    }
}

pub fn input(
    seed: Seed,
    options: GenerationOptionsDto,
) -> CoreResult<(GenerationInput, GenerationLimits)> {
    let version: GenerationVersion = options.puzzle_version.into();
    let input = GenerationInput::from_version(
        options.variant.into(),
        options.difficulty.into(),
        seed,
        version.as_str(),
    )?;
    let limits = options
        .limits
        .map_or_else(GenerationLimits::default, |limits| GenerationLimits {
            max_layouts: limits.max_layouts,
            max_work: u64::from(limits.max_work),
            max_steps: limits.max_steps,
        });
    Ok((input, limits))
}

impl From<WorkStage> for WorkStageDto {
    fn from(stage: WorkStage) -> Self {
        match stage {
            WorkStage::Preparation => Self::Preparation,
            WorkStage::Arithmetic => Self::Arithmetic,
            WorkStage::Exact => Self::Exact,
            WorkStage::Logic => Self::Logic,
            WorkStage::Proposals => Self::Proposals,
        }
    }
}

pub fn result_to_dto(result: GenerationResult) -> CoreResult<GenerationResultDto> {
    let source = result.metrics;
    let metrics = GenerationMetricsDto {
        construction_work: counter(source.construction_work)?,
        layouts: source.layouts,
        completed_layouts: source.completed_layouts,
        candidate_visits: source.candidate_visits,
        work_by_stage: WorkStage::ALL
            .into_iter()
            .map(|stage| Ok((stage.into(), counter(source.work_by_stage.used(stage))?)))
            .collect::<CoreResult<_>>()?,
    };
    Ok(match result.outcome {
        GenerationOutcome::Ready { puzzle, assessment } => {
            let content = &puzzle.content;
            let seed = puzzle
                .seed
                .as_bytes()
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect();
            let puzzle = GeneratedPuzzleDto {
                givens: (&content.givens).into(),
                solution: (&content.solution).into(),
                rules: rules_to_dto(&content.rules)?,
                difficulty: content.difficulty.into(),
                seed,
                puzzle_version: puzzle.puzzle_version.into(),
            };
            GenerationResultDto::Ready {
                puzzle,
                source: GeneratedSourceDto::Generated,
                assessment: summary_to_dto(&assessment)?,
                metrics,
            }
        }
        GenerationOutcome::BudgetExhausted { cause } => GenerationResultDto::BudgetExhausted {
            stage: GenerationStageDto::Construction,
            cause: match cause {
                sudoku_core::generation::types::GenerationExhaustionCause::WorkLimit => {
                    GenerationExhaustionDto::WorkLimit
                }
                sudoku_core::generation::types::GenerationExhaustionCause::LogicalStepLimit => {
                    GenerationExhaustionDto::LogicalStepLimit
                }
                sudoku_core::generation::types::GenerationExhaustionCause::LayoutLimit => {
                    GenerationExhaustionDto::LayoutLimit
                }
                sudoku_core::generation::types::GenerationExhaustionCause::ExhaustedFrontier => {
                    GenerationExhaustionDto::ExhaustedFrontier
                }
            },
            metrics,
        },
        GenerationOutcome::Failed { reason } => GenerationResultDto::Failed { reason, metrics },
    })
}
