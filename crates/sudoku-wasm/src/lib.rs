#![forbid(unsafe_code)]

mod conversion;
mod dto;
mod prepared;

use conversion::generation::{input as generation_input, result_to_dto};
use conversion::logic::{hint_to_core, hint_to_dto, logic_to_dto};
use conversion::rating::assessment_to_dto;
use conversion::rules::rules_to_dto;
use conversion::values::{DEFAULT_QUERY_WORK, budget, counter};
use dto::EngineInfo;
use dto::generation::{GenerationOptionsDto, GenerationResultDto};
use dto::logic::{HintInputDto, HintValidationDto, HintValidationInputDto, LogicInputDto};
use dto::operations::{CountInputDto, WorkResultDto};
use dto::rating::AssessmentInputDto;
use dto::rules::{PuzzleContentDto, RulesDto, TransformInputDto, ValidationDto};
use js_sys::{ArrayBuffer, Uint8Array};
use sudoku_core::generation::types::{PUZZLE_VERSION, VARIANT_PUZZLE_VERSION};
use sudoku_core::random::Seed;
use sudoku_core::rating::types::{
    AssessmentInput, AssessmentIssue, AssessmentLimits, AssessmentResult, RATING_VERSION,
};
use sudoku_core::types::{Board, Bounded, EngineError};
use tsify::{Ts, Tsify};
use wasm_bindgen::prelude::*;

fn js_error(error: EngineError) -> JsError {
    JsError::new(&error.to_string())
}

fn issues(error: EngineError) -> Vec<String> {
    match error {
        EngineError::InvalidInput(issues) => issues,
        error => vec![error.to_string()],
    }
}

fn checked_steps(value: Option<u32>) -> Result<u32, JsError> {
    let steps = value.unwrap_or(500);
    if steps > 500 {
        return Err(JsError::new(
            "Logical step limits may only lower the fixed bound",
        ));
    }
    Ok(steps)
}

fn owned_bytes(value: &Uint8Array) -> Result<Vec<u8>, JsError> {
    // Slice ABI glue can coerce strings/array-like values. Inspect the original JS handle before copying.
    if !ArrayBuffer::is_view(value.as_ref()) || !value.is_instance_of::<Uint8Array>() {
        return Err(JsError::new("Expected a Uint8Array"));
    }
    Ok(value.to_vec())
}

#[wasm_bindgen]
pub fn engine_info() -> Result<Ts<EngineInfo>, JsError> {
    Ok(EngineInfo {
        bridge_version: 1,
        puzzle_version: PUZZLE_VERSION,
        variant_puzzle_version: VARIANT_PUZZLE_VERSION,
        rating_version: RATING_VERSION,
    }
    .into_ts()?)
}

#[wasm_bindgen]
pub fn derive_seed(material: Uint8Array) -> Result<Vec<u8>, JsError> {
    Ok(Seed::derive(&owned_bytes(&material)?).as_bytes().to_vec())
}

#[wasm_bindgen]
pub fn generate(
    seed: Uint8Array,
    options: Ts<GenerationOptionsDto>,
) -> Result<Ts<GenerationResultDto>, JsError> {
    let seed = Seed::try_from(owned_bytes(&seed)?.as_slice()).map_err(js_error)?;
    let (input, limits) = generation_input(seed, options.to_rust()?).map_err(js_error)?;
    let result =
        sudoku_core::generation::generate::generate_puzzle(&input, &limits).map_err(js_error)?;
    Ok(result_to_dto(result).map_err(js_error)?.into_ts()?)
}

#[wasm_bindgen]
pub fn analyze_logic(
    input: Ts<LogicInputDto>,
) -> Result<Ts<crate::dto::operations::LogicWorkDto>, JsError> {
    let input = input.to_rust()?;
    let board: Board = input.board.try_into().map_err(js_error)?;
    let rules = input.rules.try_into().map_err(js_error)?;
    let rules = sudoku_core::rules::context::compile_rules(&rules).map_err(js_error)?;
    let allowed: Vec<_> = input.allowed.into_iter().map(Into::into).collect();
    let mut work = budget(Some(input.max_work), None, DEFAULT_QUERY_WORK).map_err(js_error)?;
    let result = sudoku_core::logic::solver::analyze_logic(
        &board,
        &rules,
        &allowed,
        checked_steps(Some(input.max_steps))?,
        &mut work,
    );
    Ok(crate::dto::operations::LogicWorkDto(WorkResultDto {
        result: logic_to_dto(&result).map_err(js_error)?,
        work_used: counter(work.used()).map_err(js_error)?,
    })
    .into_ts()?)
}

#[wasm_bindgen]
pub fn hint(input: Ts<HintInputDto>) -> Result<Ts<crate::dto::operations::HintWorkDto>, JsError> {
    let input = input.to_rust()?;
    let board: Board = input.board.try_into().map_err(js_error)?;
    let solution: Board = input.solution.try_into().map_err(js_error)?;
    let rules = input.rules.try_into().map_err(js_error)?;
    let rules = sudoku_core::rules::context::compile_rules(&rules).map_err(js_error)?;
    let mut work = budget(input.max_work, None, DEFAULT_QUERY_WORK).map_err(js_error)?;
    let result = sudoku_core::hint::analyze_hint(
        &board,
        &solution,
        &rules,
        checked_steps(input.max_steps)?,
        &mut work,
    );
    Ok(crate::dto::operations::HintWorkDto(WorkResultDto {
        result: hint_to_dto(&result).map_err(js_error)?,
        work_used: counter(work.used()).map_err(js_error)?,
    })
    .into_ts()?)
}

#[wasm_bindgen]
pub fn assess(
    input: Ts<AssessmentInputDto>,
) -> Result<Ts<crate::dto::operations::AssessmentWorkDto>, JsError> {
    let input = input.to_rust()?;
    let board: Board = input.board.try_into().map_err(js_error)?;
    let rules = input.rules.try_into().map_err(js_error)?;
    let limits = input
        .limits
        .map_or_else(AssessmentLimits::default, |limits| AssessmentLimits {
            max_steps: limits.max_steps,
            max_work: u64::from(limits.max_work),
        });
    let snapshot = AssessmentInput {
        board,
        rules,
        rating_version: input
            .rating_version
            .unwrap_or_else(|| RATING_VERSION.to_string()),
        limits,
    };
    let maximum = input.max_work.map(u64::from).unwrap_or(limits.max_work);
    let mut work = sudoku_core::budget::WorkBudget::new(maximum);
    let result = if work.consume(u64::from(input.initial_work.unwrap_or(0))) {
        sudoku_core::rating::assessment::assess_puzzle_with_budget(&snapshot, &mut work)
    } else {
        AssessmentResult::Unrated(sudoku_core::rating::types::AssessmentFailure::Invalid {
            issues: vec![AssessmentIssue::Message(
                "Invalid caller-owned assessment budget".to_string(),
            )],
        })
    };
    Ok(crate::dto::operations::AssessmentWorkDto(WorkResultDto {
        result: assessment_to_dto(&result).map_err(js_error)?,
        work_used: counter(work.used()).map_err(js_error)?,
    })
    .into_ts()?)
}

#[wasm_bindgen]
pub fn count_solutions(
    input: Ts<CountInputDto>,
) -> Result<Ts<crate::dto::operations::SearchWorkDto>, JsError> {
    let input = input.to_rust()?;
    let board: Board = input.board.try_into().map_err(js_error)?;
    let rules = input.rules.try_into().map_err(js_error)?;
    let options = input.work.unwrap_or_default();
    let mut work =
        budget(options.max_work, options.initial_work, DEFAULT_QUERY_WORK).map_err(js_error)?;
    let nodes = options
        .node_limit
        .map(u64::from)
        .unwrap_or(work.remaining());
    let result = sudoku_core::search::exact::count_with_rules(&board, &rules, &mut work, nodes)
        .map_err(js_error)?;
    Ok(crate::dto::operations::SearchWorkDto(WorkResultDto {
        result: prepared::search_to_dto(result).map_err(js_error)?,
        work_used: counter(work.used()).map_err(js_error)?,
    })
    .into_ts()?)
}

#[wasm_bindgen]
pub fn validate_puzzle(input: Ts<PuzzleContentDto>) -> Result<Ts<ValidationDto>, JsError> {
    let content = input
        .to_rust()
        .map_err(|_| EngineError::invalid("Invalid puzzle board or rules"))
        .and_then(|value| value.try_into());
    let outcome = content.and_then(|content| {
        sudoku_core::puzzle::validate_puzzle_bounded(
            &content,
            &mut sudoku_core::budget::WorkBudget::new(u64::from(DEFAULT_QUERY_WORK)),
        )
    });
    let result = match outcome {
        Ok(Bounded::Complete(())) => ValidationDto::Valid,
        Ok(Bounded::BudgetExhausted) => ValidationDto::BudgetExhausted,
        Err(error) => ValidationDto::Invalid {
            issues: issues(error),
        },
    };
    Ok(result.into_ts()?)
}

#[wasm_bindgen]
pub fn validate_hint_evidence(
    input: Ts<HintValidationInputDto>,
) -> Result<Ts<HintValidationDto>, JsError> {
    let parsed = input
        .to_rust()
        .map_err(|_| EngineError::invalid("Hint evidence does not match the requested rules"));
    let outcome = parsed.and_then(|input| {
        let hint = hint_to_core(input.hint)?;
        let rules = input.rules.try_into()?;
        let board: Option<Board> = input.board.map(TryInto::try_into).transpose()?;
        sudoku_core::logic::hint_validation::validate_hint_evidence(&hint, &rules, board.as_ref())
    });
    let result = match outcome {
        Ok(hint) => HintValidationDto::Valid {
            hint: hint_to_dto(&hint).map_err(js_error)?,
        },
        Err(error) => HintValidationDto::Invalid {
            issues: issues(error),
        },
    };
    Ok(result.into_ts()?)
}

#[wasm_bindgen]
pub fn transform_rules(input: Ts<TransformInputDto>) -> Result<Ts<RulesDto>, JsError> {
    let input = input.to_rust()?;
    let rules = input.rules.try_into().map_err(js_error)?;
    let symmetry = sudoku_core::generation::variant::SpatialSymmetry::try_from(input.symmetry)
        .map_err(js_error)?;
    let transformed =
        sudoku_core::generation::variant::transform_rules(&rules, symmetry, input.complement)
            .map_err(js_error)?;
    Ok(rules_to_dto(&transformed).map_err(js_error)?.into_ts()?)
}

#[wasm_bindgen]
pub fn validate_assessment(
    input: Ts<dto::rating::AssessmentValidationInputDto>,
) -> Result<Ts<dto::rating::AssessmentValidationDto>, JsError> {
    Ok(conversion::metadata::decode(input.to_rust()?)
        .map_err(js_error)?
        .into_ts()?)
}

#[wasm_bindgen]
pub fn parse_assessment_summary(
    value: Ts<dto::rating::RawAssessmentDto>,
) -> Result<Ts<dto::rating::ParsedSummaryDto>, JsError> {
    let parsed = conversion::metadata::parse_summary(&value.to_rust()?.0)
        .and_then(|value| conversion::rating::summary_to_dto(&value));
    let result = match parsed {
        Ok(value) => dto::rating::ParsedAssessmentDto::Valid { valid: true, value },
        Err(error) => dto::rating::ParsedAssessmentDto::Invalid {
            valid: false,
            issues: issues(error),
        },
    };
    Ok(dto::rating::ParsedSummaryDto(result).into_ts()?)
}

#[wasm_bindgen]
pub fn parse_assessment_outcome(
    value: Ts<dto::rating::RawAssessmentDto>,
) -> Result<Ts<dto::rating::ParsedOutcomeDto>, JsError> {
    let result = match conversion::metadata::parse_outcome(&value.to_rust()?.0) {
        Ok(value) => dto::rating::ParsedAssessmentDto::Valid { valid: true, value },
        Err(error) => dto::rating::ParsedAssessmentDto::Invalid {
            valid: false,
            issues: issues(error),
        },
    };
    Ok(dto::rating::ParsedOutcomeDto(result).into_ts()?)
}
