#![forbid(unsafe_code)]
uniffi::setup_scaffolding!();
mod conversion;
pub mod dto;
pub use dto::{generation::*, logic::*, operations::*, rating::*, rules::*, values::*};
mod control;
mod prepared;
pub use control::{CancellationToken, NativeError};
use conversion::values::counter;
pub use prepared::PreparedPuzzle;
use std::sync::Arc;
use sudoku_core::{
    random::Seed,
    types::{Board, Bounded, EngineError},
};

#[derive(uniffi::Record)]
pub struct EngineInfo {
    pub bridge_version: u32,
    pub puzzle_version: String,
    pub variant_puzzle_version: String,
    pub rating_version: String,
}

#[uniffi::export]
pub fn engine_info() -> EngineInfo {
    EngineInfo {
        bridge_version: 1,
        puzzle_version: sudoku_core::generation::types::PUZZLE_VERSION.into(),
        variant_puzzle_version: sudoku_core::generation::types::VARIANT_PUZZLE_VERSION.into(),
        rating_version: sudoku_core::rating::types::RATING_VERSION.into(),
    }
}

#[uniffi::export]
pub fn derive_seed(material: Vec<u8>) -> Vec<u8> {
    Seed::derive(&material).as_bytes().to_vec()
}

#[uniffi::export]
pub fn prepare_puzzle(
    input: PrepareInputDto,
    token: Arc<CancellationToken>,
) -> Result<Arc<PreparedPuzzle>, NativeError> {
    Ok(Arc::new(PreparedPuzzle::new(input, token)?))
}

#[uniffi::export]
pub fn generate(
    seed: Vec<u8>,
    options: GenerationOptionsDto,
    token: Arc<CancellationToken>,
) -> Result<GenerationResultDto, NativeError> {
    let seed = Seed::try_from(seed.as_slice())?;
    let (input, limits) = conversion::generation::input(seed, options)?;
    match sudoku_core::generation::generate::generate_puzzle_controlled(&input, &limits, token)? {
        sudoku_core::budget::Controlled::Complete(result) => {
            Ok(conversion::generation::result_to_dto(result)?)
        }
        sudoku_core::budget::Controlled::Cancelled { work_used } => {
            Err(NativeError::Cancelled { work_used })
        }
    }
}

fn checked_steps(steps: Option<u32>) -> Result<u32, NativeError> {
    let steps = steps.unwrap_or(500);
    if steps > 500 {
        return Err(
            EngineError::invalid("Logical step limits may only lower the fixed bound").into(),
        );
    }
    Ok(steps)
}

#[uniffi::export]
pub fn hint(
    input: HintInputDto,
    token: Arc<CancellationToken>,
) -> Result<HintWorkDto, NativeError> {
    let board: Board = input.board.try_into()?;
    let solution: Board = input.solution.try_into()?;
    let rules = input.rules.try_into()?;
    let rules = sudoku_core::rules::context::compile_rules(&rules)?;
    let steps = checked_steps(input.max_steps)?;
    let mut work = control::budget(input.max_work, None, token)?;
    let result = sudoku_core::hint::analyze_hint(&board, &solution, &rules, steps, &mut work);
    control::check(&work)?;
    Ok(HintWorkDto {
        result: conversion::logic::hint_to_dto(&result)?,
        work_used: counter(work.used())?,
    })
}

#[uniffi::export]
pub fn analyze_logic(
    input: LogicInputDto,
    token: Arc<CancellationToken>,
) -> Result<LogicWorkDto, NativeError> {
    let board: Board = input.board.try_into()?;
    let rules = input.rules.try_into()?;
    let rules = sudoku_core::rules::context::compile_rules(&rules)?;
    let allowed: Vec<_> = input.allowed.into_iter().map(Into::into).collect();
    let steps = checked_steps(Some(input.max_steps))?;
    let mut work = control::budget(Some(input.max_work), None, token)?;
    let result =
        sudoku_core::logic::solver::analyze_logic(&board, &rules, &allowed, steps, &mut work);
    control::check(&work)?;
    Ok(LogicWorkDto {
        result: conversion::logic::logic_to_dto(&result)?,
        work_used: counter(work.used())?,
    })
}

fn run_assessment(
    input: AssessmentInputDto,
    token: Arc<CancellationToken>,
) -> Result<(sudoku_core::rating::types::AssessmentResult, u32), NativeError> {
    use sudoku_core::rating::types::{AssessmentInput, AssessmentLimits, RATING_VERSION};
    let board: Board = input.board.try_into()?;
    let rules = input.rules.try_into()?;
    let limits = input
        .limits
        .map_or_else(AssessmentLimits::default, |v| AssessmentLimits {
            max_steps: v.max_steps,
            max_work: u64::from(v.max_work),
        });
    let snapshot = AssessmentInput {
        board,
        rules,
        rating_version: input
            .rating_version
            .unwrap_or_else(|| RATING_VERSION.into()),
        limits,
    };
    let maximum = input
        .max_work
        .or(Some(u32::try_from(limits.max_work).map_err(|_| {
            EngineError::invalid("Assessment budget exceeds fixed bounds")
        })?));
    let mut work = control::budget(maximum, input.initial_work, token)?;
    let result = sudoku_core::rating::assessment::assess_puzzle_with_budget(&snapshot, &mut work);
    control::check(&work)?;
    Ok((result, counter(work.used())?))
}

#[uniffi::export]
pub fn assess(
    input: AssessmentInputDto,
    token: Arc<CancellationToken>,
) -> Result<AssessmentWorkDto, NativeError> {
    let (result, work_used) = run_assessment(input, token)?;
    Ok(AssessmentWorkDto {
        result: conversion::rating::assessment_to_dto(&result)?,
        work_used,
    })
}

#[uniffi::export]
pub fn assess_summary(
    input: AssessmentInputDto,
    token: Arc<CancellationToken>,
) -> Result<AssessmentSummaryWorkDto, NativeError> {
    let (result, work_used) = run_assessment(input, token)?;
    Ok(AssessmentSummaryWorkDto {
        result: conversion::rating::assessment_summary_to_dto(&result)?,
        work_used,
    })
}

#[uniffi::export]
pub fn validate_puzzle(
    input: PuzzleContentDto,
    token: Arc<CancellationToken>,
) -> Result<ValidationDto, NativeError> {
    let content = input.try_into()?;
    let mut work = control::budget(None, None, token)?;
    let result = sudoku_core::puzzle::validate_puzzle_bounded(&content, &mut work);
    control::check(&work)?;
    Ok(match result {
        Ok(Bounded::Complete(())) => ValidationDto::Valid,
        Ok(Bounded::BudgetExhausted) => ValidationDto::BudgetExhausted,
        Err(error) => ValidationDto::Invalid {
            issues: vec![error.to_string()],
        },
    })
}

#[uniffi::export]
pub fn validate_hint_evidence(
    input: HintValidationInputDto,
    token: Arc<CancellationToken>,
) -> Result<HintValidationDto, NativeError> {
    let hint = conversion::logic::hint_to_core(input.hint)?;
    let rules = input.rules.try_into()?;
    let board: Option<Board> = input.board.map(TryInto::try_into).transpose()?;
    let mut work = control::budget(None, None, token)?;
    let result = sudoku_core::logic::hint_validation::validate_hint_evidence_with_budget(
        &hint,
        &rules,
        board.as_ref(),
        &mut work,
    );
    control::check(&work)?;
    if work.is_exhausted() {
        return Err(NativeError::BudgetExhausted {
            work_used: work.used(),
        });
    }
    Ok(match result {
        Ok(hint) => HintValidationDto::Valid {
            hint: conversion::logic::hint_to_dto(&hint)?,
        },
        Err(error) => HintValidationDto::Invalid {
            issues: vec![error.to_string()],
        },
    })
}

#[uniffi::export]
pub fn transform_rules(input: TransformInputDto) -> Result<RulesDto, NativeError> {
    let rules = input.rules.try_into()?;
    let symmetry = sudoku_core::generation::variant::SpatialSymmetry::try_from(input.symmetry)?;
    Ok(conversion::rules::rules_to_dto(
        &sudoku_core::generation::variant::transform_rules(&rules, symmetry, input.complement)?,
    )?)
}

#[uniffi::export]
pub fn validate_teaching_step(
    input: TeachingStepInputDto,
    token: Arc<CancellationToken>,
) -> Result<ValidationDto, NativeError> {
    let board = input.board.try_into()?;
    let rules = input.rules.try_into()?;
    let candidates = input
        .candidates
        .into_iter()
        .map(sudoku_core::types::CandidateMask::try_from)
        .collect::<Result<Vec<_>, _>>()?
        .try_into()
        .map_err(|_| EngineError::invalid("Teaching state requires 81 masks"))?;
    let step = conversion::logic::step_to_core(input.step)?;
    let mut work = control::budget(None, None, token)?;
    let result = sudoku_core::logic::hint_validation::validate_teaching_step_with_budget(
        &board, candidates, &rules, &step, &mut work,
    );
    control::check(&work)?;
    if work.is_exhausted() {
        return Ok(ValidationDto::BudgetExhausted);
    }
    Ok(match result {
        Ok(()) => ValidationDto::Valid,
        Err(error) => ValidationDto::Invalid {
            issues: vec![error.to_string()],
        },
    })
}

#[uniffi::export]
pub fn validate_assessment(
    value: Option<StoredAssessmentDto>,
    identity: AssessmentIdentityDto,
) -> Result<AssessmentValidationDto, NativeError> {
    use sudoku_core::rating::types::{
        AssessmentIdentity, DifficultyAssessment, PuzzleAssessment, ReasoningWorkload,
        StoredAssessment, TechniqueCounts,
    };
    let summary = |value: AssessmentSummaryDto| -> Result<DifficultyAssessment, EngineError> {
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
    };
    let stored = value.map(|value| match value {
        StoredAssessmentDto::Rated {
            rating_version,
            summary: value,
        } => StoredAssessment::Rated {
            rating_version,
            summary: value
                .ok_or_else(|| vec!["Invalid assessment summary".into()])
                .and_then(|value| summary(value).map_err(|error| vec![error.to_string()])),
        },
        StoredAssessmentDto::Unavailable { reason, issues } => StoredAssessment::Unavailable {
            reason: reason.into(),
            issues,
        },
        StoredAssessmentDto::Malformed { issues } => StoredAssessment::Malformed { issues },
    });
    Ok(
        match sudoku_core::rating::decoding::decode_puzzle_assessment(
            stored.as_ref(),
            AssessmentIdentity {
                variant: identity.variant.into(),
                difficulty: identity.difficulty.into(),
            },
        ) {
            None => AssessmentValidationDto::Absent,
            Some(PuzzleAssessment::Rated(summary)) => AssessmentValidationDto::Present {
                value: PuzzleAssessmentDto::Rated {
                    summary: conversion::rating::summary_to_dto(&summary)?,
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
        },
    )
}

#[uniffi::export]
pub fn validate_rules(rules: RulesDto) -> ValidationDto {
    match sudoku_core::rules::types::PuzzleRules::try_from(rules) {
        Ok(_) => ValidationDto::Valid,
        Err(error) => ValidationDto::Invalid {
            issues: vec![error.to_string()],
        },
    }
}
