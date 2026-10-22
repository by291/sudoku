#![forbid(unsafe_code)]
uniffi::setup_scaffolding!();
mod conversion;
pub mod dto;
pub use dto::{generation::*, logic::*, operations::*, rating::*, rules::*, values::*};
mod control;
mod prepared;
pub use control::{CancellationToken, NativeError};
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
        bridge_version: 3,
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
        sudoku_core::control::Controlled::Complete(result) => {
            Ok(conversion::generation::result_to_dto(result)?)
        }
        sudoku_core::control::Controlled::Cancelled => Err(NativeError::Cancelled),
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
) -> Result<HintComputationDto, NativeError> {
    let board: Board = input.board.try_into()?;
    let solution: Board = input.solution.try_into()?;
    let rules = input.rules.try_into()?;
    let rules = sudoku_core::rules::context::compile_rules(&rules)?;
    let steps = checked_steps(input.max_steps)?;
    let mut execution_control = control::execution(token)?;
    let result =
        sudoku_core::hint::analyze_hint(&board, &solution, &rules, steps, &mut execution_control);
    control::check(&execution_control)?;
    Ok(HintComputationDto {
        result: conversion::logic::hint_to_dto(&result)?,
    })
}

#[uniffi::export]
pub fn analyze_logic(
    input: LogicInputDto,
    token: Arc<CancellationToken>,
) -> Result<LogicComputationDto, NativeError> {
    let board: Board = input.board.try_into()?;
    let rules = input.rules.try_into()?;
    let rules = sudoku_core::rules::context::compile_rules(&rules)?;
    let allowed: Vec<_> = input.allowed.into_iter().map(Into::into).collect();
    let steps = checked_steps(Some(input.max_steps))?;
    let mut execution_control = control::execution(token)?;
    let result = sudoku_core::logic::solver::analyze_logic(
        &board,
        &rules,
        &allowed,
        steps,
        &mut execution_control,
    );
    control::check(&execution_control)?;
    Ok(LogicComputationDto {
        result: conversion::logic::logic_to_dto(&result)?,
    })
}

fn run_assessment(
    input: AssessmentInputDto,
    token: Arc<CancellationToken>,
) -> Result<sudoku_core::rating::types::AssessmentResult, NativeError> {
    use sudoku_core::rating::types::{AssessmentInput, AssessmentLimits, RATING_VERSION};
    let board: Board = input.board.try_into()?;
    let rules = input.rules.try_into()?;
    let limits = input
        .limits
        .map_or_else(AssessmentLimits::default, |v| AssessmentLimits {
            max_steps: v.max_steps,
        });
    let snapshot = AssessmentInput {
        board,
        rules,
        rating_version: input
            .rating_version
            .unwrap_or_else(|| RATING_VERSION.into()),
        limits,
    };
    let mut execution_control = control::execution(token)?;
    let result = sudoku_core::rating::assessment::assess_puzzle_with_control(
        &snapshot,
        &mut execution_control,
    );
    control::check(&execution_control)?;
    Ok(result)
}

#[uniffi::export]
pub fn assess(
    input: AssessmentInputDto,
    token: Arc<CancellationToken>,
) -> Result<AssessmentComputationDto, NativeError> {
    let result = run_assessment(input, token)?;
    Ok(AssessmentComputationDto {
        result: conversion::rating::assessment_to_dto(&result)?,
    })
}

#[uniffi::export]
pub fn assess_summary(
    input: AssessmentInputDto,
    token: Arc<CancellationToken>,
) -> Result<AssessmentSummaryComputationDto, NativeError> {
    let result = run_assessment(input, token)?;
    Ok(AssessmentSummaryComputationDto {
        result: conversion::rating::assessment_summary_to_dto(&result)?,
    })
}

#[uniffi::export]
pub fn validate_puzzle(
    input: PuzzleContentDto,
    token: Arc<CancellationToken>,
) -> Result<ValidationDto, NativeError> {
    let content = input.try_into()?;
    let mut execution_control = control::execution(token)?;
    let result = sudoku_core::puzzle::validate_puzzle_bounded(&content, &mut execution_control);
    control::check(&execution_control)?;
    Ok(match result {
        Ok(Bounded::Complete(())) => ValidationDto::Valid,
        Ok(Bounded::Cancelled) => ValidationDto::Incomplete,
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
    let mut execution_control = control::execution(token)?;
    let result = sudoku_core::hint::validation::validate_hint_evidence_with_control(
        &hint,
        &rules,
        board.as_ref(),
        &mut execution_control,
    );
    control::check(&execution_control)?;
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
    let mut execution_control = control::execution(token)?;
    let result = sudoku_core::logic::teaching::validate_teaching_step_with_control(
        &board,
        candidates,
        &rules,
        &step,
        &mut execution_control,
    );
    control::check(&execution_control)?;
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
    Ok(conversion::metadata::decode(value, identity)?)
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
