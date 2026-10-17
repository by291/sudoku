//! Live diagnostics are checked independently of historical string-shaped metadata.
use super::metadata;
use crate::dto::operations::{ViolationCodeDto, ViolationDto};
use crate::dto::rating::{AssessmentIssueDto, AssessmentOutcomeDto, LiveAssessmentOutcomeDto};
use js_sys::{Object, Reflect};
use sudoku_core::logic::techniques::{ALL_TECHNIQUES, Technique};
use sudoku_core::types::{CoreResult, EngineError};
use wasm_bindgen::JsValue;

#[wasm_bindgen::prelude::wasm_bindgen]
extern "C" {
    // Array.isArray can throw for a revoked Proxy, even though it does not read getters.
    #[wasm_bindgen::prelude::wasm_bindgen(js_namespace = Array, js_name = isArray, catch)]
    fn is_array(value: &JsValue) -> Result<bool, JsValue>;
}

fn invalid() -> EngineError {
    EngineError::invalid("Invalid live assessment outcome")
}

fn get(value: &JsValue, field: &str) -> CoreResult<JsValue> {
    Reflect::get(value, &JsValue::from_str(field)).map_err(|_| invalid())
}

fn text(value: &JsValue) -> CoreResult<String> {
    value
        .as_string()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(invalid)
}

fn record(value: &JsValue, fields: &[&str]) -> CoreResult<()> {
    if !value.is_object() || value.is_null() || is_array(value).map_err(|_| invalid())? {
        return Err(invalid());
    }

    // Reflect catches throwing getters/proxies; an unknown field cannot silently change the union shape.
    let keys = Reflect::own_keys(value).map_err(|_| invalid())?;
    for key in keys.iter() {
        let key = key.as_string().ok_or_else(invalid)?;
        if !fields.contains(&key.as_str()) {
            return Err(invalid());
        }
    }
    Ok(())
}

fn number(value: &JsValue, maximum: u32) -> CoreResult<u32> {
    let number = value.as_f64().ok_or_else(invalid)?;
    if !number.is_finite() || number.fract() != 0.0 || !(0.0..=f64::from(maximum)).contains(&number)
    {
        return Err(invalid());
    }
    Ok(number as u32)
}

fn array(value: &JsValue, maximum: u32) -> CoreResult<Vec<JsValue>> {
    if !is_array(value).map_err(|_| invalid())? {
        return Err(invalid());
    }
    let length = number(&get(value, "length")?, maximum)?;
    if length == 0 {
        return Err(invalid());
    }

    // Copy each element through a fallible property read instead of retaining caller-owned arrays.
    (0..length)
        .map(|index| get(value, &index.to_string()))
        .collect()
}

fn violation(value: &JsValue) -> CoreResult<ViolationDto> {
    record(value, &["constraintId", "cells", "code"])?;
    let constraint_id = text(&get(value, "constraintId")?)?;
    let cells = array(&get(value, "cells")?, 81)?
        .iter()
        .map(|cell| number(cell, 80))
        .collect::<CoreResult<_>>()?;
    let code = get(value, "code")?;
    let kind = text(&get(&code, "kind")?)?;
    let code = match kind.as_str() {
        "duplicate" => {
            record(&code, &["kind"])?;
            ViolationCodeDto::Duplicate
        }
        "cage-total" => {
            record(&code, &["kind", "index", "sum"])?;
            ViolationCodeDto::CageTotal {
                index: number(&get(&code, "index")?, u32::MAX)?,
                sum: number(&get(&code, "sum")?, u32::from(u16::MAX))? as u16,
            }
        }
        "thermo-order" | "arrow-total" => {
            record(&code, &["kind", "index"])?;
            let index = number(&get(&code, "index")?, u32::MAX)?;
            if kind == "thermo-order" {
                ViolationCodeDto::ThermoOrder { index }
            } else {
                ViolationCodeDto::ArrowTotal { index }
            }
        }
        _ => return Err(invalid()),
    };

    Ok(ViolationDto {
        constraint_id,
        cells,
        code,
    })
}

fn issue(value: &JsValue) -> CoreResult<AssessmentIssueDto> {
    // Check the record before reading its discriminant (null and primitives are malformed).
    record(value, &["kind", "message", "violation"])?;
    match text(&get(value, "kind")?)?.as_str() {
        "message" => {
            record(value, &["kind", "message"])?;
            Ok(AssessmentIssueDto::Message {
                message: text(&get(value, "message")?)?,
            })
        }
        "violation" => {
            record(value, &["kind", "violation"])?;
            Ok(AssessmentIssueDto::Violation {
                violation: violation(&get(value, "violation")?)?,
            })
        }
        _ => Err(invalid()),
    }
}

fn copy_fields(value: &JsValue, fields: &[&str]) -> CoreResult<JsValue> {
    if !value.is_object() || value.is_null() || is_array(value).map_err(|_| invalid())? {
        return Err(invalid());
    }
    let copy = Object::new();
    for field in fields {
        Reflect::set(&copy, &JsValue::from_str(field), &get(value, field)?)
            .map_err(|_| invalid())?;
    }
    Ok(copy.into())
}

fn summary_snapshot(value: &JsValue) -> CoreResult<JsValue> {
    let summary = copy_fields(
        value,
        &["ratingVersion", "variant", "difficulty", "workload"],
    )?;
    let workload = copy_fields(
        &get(&summary, "workload")?,
        &[
            "steps",
            "placements",
            "eliminations",
            "candidateRemovals",
            "variantSteps",
            "highestTechnique",
            "highestTier",
            "techniqueCounts",
        ],
    )?;
    let counts = get(&workload, "techniqueCounts")?;
    if !counts.is_object() || counts.is_null() || is_array(&counts).map_err(|_| invalid())? {
        return Err(invalid());
    }
    let keys = Reflect::own_keys(&counts).map_err(|_| invalid())?;
    if keys.length() as usize != ALL_TECHNIQUES.len() {
        return Err(EngineError::invalid(
            "Assessment technique counts must include every known technique",
        ));
    }

    let owned_counts = Object::new();
    for key in keys.iter() {
        let key = key.as_string().ok_or_else(invalid)?;
        // Reject unknown own keys before copying: __proto__ must never invoke Object's setter.
        if Technique::parse(&key).is_none() {
            return Err(EngineError::invalid(
                "Invalid or inapplicable assessment technique count",
            ));
        }
        Reflect::set(
            &owned_counts,
            &JsValue::from_str(&key),
            &get(&counts, &key)?,
        )
        .map_err(|_| invalid())?;
    }
    Reflect::set(
        &workload,
        &JsValue::from_str("techniqueCounts"),
        &owned_counts,
    )
    .map_err(|_| invalid())?;
    Reflect::set(&summary, &JsValue::from_str("workload"), &workload).map_err(|_| invalid())?;
    Ok(summary)
}

pub(crate) fn parse(value: &JsValue) -> CoreResult<LiveAssessmentOutcomeDto> {
    record(
        value,
        &[
            "status",
            "summary",
            "issues",
            "ratingVersion",
            "variant",
            "stage",
            "difficulty",
        ],
    )?;
    let status = text(&get(value, "status")?)?;
    match status.as_str() {
        "invalid" => {
            record(value, &["status", "issues"])?;
            let issues = array(&get(value, "issues")?, u32::MAX)?
                .iter()
                .map(issue)
                .collect::<CoreResult<_>>()?;
            return Ok(LiveAssessmentOutcomeDto::Invalid { issues });
        }
        "rated" => {
            record(value, &["status", "summary"])?;
            // The historical summary validator sees only owned plain records, so reflective failures
            // cannot escape through its Object.keys call. Numeric and null distinctions remain intact.
            let summary = metadata::parse_summary(&summary_snapshot(&get(value, "summary")?)?)?;
            return Ok(LiveAssessmentOutcomeDto::Rated {
                summary: super::rating::summary_to_dto(&summary)?,
            });
        }
        "ungraded" => record(value, &["status", "ratingVersion", "variant"])?,
        "budget-exhausted" => record(
            value,
            &["status", "ratingVersion", "variant", "stage", "difficulty"],
        )?,
        _ => return Err(invalid()),
    }

    // Reuse existing identity/stage policy, including absent versus explicit null difficulty.
    let owned = copy_fields(
        value,
        &["status", "ratingVersion", "variant", "stage", "difficulty"],
    )?;
    match metadata::parse_outcome(&owned)? {
        AssessmentOutcomeDto::Ungraded {
            rating_version,
            variant,
        } => Ok(LiveAssessmentOutcomeDto::Ungraded {
            rating_version,
            variant,
        }),
        AssessmentOutcomeDto::BudgetExhausted {
            rating_version,
            variant,
            stage,
            difficulty,
        } => Ok(LiveAssessmentOutcomeDto::BudgetExhausted {
            rating_version,
            variant,
            stage,
            difficulty,
        }),
        _ => Err(invalid()),
    }
}
