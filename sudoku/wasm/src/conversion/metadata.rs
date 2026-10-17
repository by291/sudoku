//! Preserve JS absence, null, number kinds and version-first failures at the wire boundary.
use super::rating::summary_to_dto;
use crate::dto::rating::{
    AssessmentOutcomeDto, AssessmentValidationDto, AssessmentValidationInputDto,
    PuzzleAssessmentDto, UnavailableReasonDto,
};
use js_sys::{Array, Object, Reflect};
use sudoku_core::logic::techniques::{ALL_TECHNIQUES, Technique};
use sudoku_core::rating::decoding::{decode_puzzle_assessment, validate_summary};
use sudoku_core::rating::policies::supports_difficulty;
use sudoku_core::rating::types::{
    AssessmentIdentity, DifficultyAssessment, PuzzleAssessment, RATING_VERSION, ReasoningWorkload,
    StoredAssessment, TechniqueCounts, UnavailableReason,
};
use sudoku_core::rules::types::SudokuVariant;
use sudoku_core::types::{CoreResult, Difficulty, EngineError};
use wasm_bindgen::{JsCast, JsValue};

fn error(message: &str) -> EngineError {
    EngineError::invalid(message)
}

fn record(value: &JsValue) -> bool {
    value.is_object() && !value.is_null() && !Array::is_array(value)
}

fn get(value: &JsValue, name: &str) -> CoreResult<JsValue> {
    Reflect::get(value, &JsValue::from_str(name))
        .map_err(|_| error("Cannot read assessment property"))
}

fn equals(value: &JsValue, expected: &str) -> bool {
    value.as_string().as_deref() == Some(expected)
}

fn variant(value: &JsValue) -> Option<SudokuVariant> {
    match value.as_string()?.as_str() {
        "classic" => Some(SudokuVariant::Classic),
        "diagonal" => Some(SudokuVariant::Diagonal),
        "jigsaw" => Some(SudokuVariant::Jigsaw),
        "killer" => Some(SudokuVariant::Killer),
        "thermo" => Some(SudokuVariant::Thermo),
        "arrow" => Some(SudokuVariant::Arrow),
        _ => None,
    }
}

fn difficulty(value: &JsValue) -> Option<Difficulty> {
    let name = value.as_string()?;
    Difficulty::ALL
        .into_iter()
        .find(|item| item.as_str() == name)
}

fn count(value: &JsValue) -> Option<u64> {
    // as_f64 accepts only JS numbers; BigInt, booleans and numeric text must not coerce.
    let number = value.as_f64()?;
    (number.is_finite() && (0.0..=9007199254740991.0).contains(&number) && number.fract() == 0.0)
        .then_some(number as u64)
}

fn issue_strings(value: &JsValue) -> Option<Vec<String>> {
    if !Array::is_array(value) {
        return None;
    }
    Array::from(value)
        .iter()
        .map(|value| value.as_string().filter(|text| !text.trim().is_empty()))
        .collect()
}

pub fn parse_summary(value: &JsValue) -> CoreResult<DifficultyAssessment> {
    let identity_error = || error("Invalid assessment summary identity");
    if !record(value) || !equals(&get(value, "ratingVersion")?, RATING_VERSION) {
        return Err(identity_error());
    }

    let variant = variant(&get(value, "variant")?).ok_or_else(identity_error)?;
    let difficulty = difficulty(&get(value, "difficulty")?).ok_or_else(identity_error)?;
    if !supports_difficulty(variant, difficulty) {
        return Err(identity_error());
    }

    let workload = get(value, "workload")?;
    if !record(&workload) {
        return Err(identity_error());
    }

    let workload_error = || error("Invalid assessment workload counts");
    let steps = count(&get(&workload, "steps")?).ok_or_else(workload_error)?;
    let placements = count(&get(&workload, "placements")?).ok_or_else(workload_error)?;
    let eliminations = count(&get(&workload, "eliminations")?).ok_or_else(workload_error)?;
    let candidate_removals =
        count(&get(&workload, "candidateRemovals")?).ok_or_else(workload_error)?;
    let variant_steps = count(&get(&workload, "variantSteps")?).ok_or_else(workload_error)?;

    let counts = get(&workload, "techniqueCounts")?;
    if !record(&counts) {
        return Err(workload_error());
    }

    let keys = Object::keys(counts.unchecked_ref::<Object>());
    let technique_count = ALL_TECHNIQUES.len();
    if keys.length() as usize != technique_count {
        return Err(error(
            "Assessment technique counts must include every known technique",
        ));
    }

    let mut entries = Vec::with_capacity(technique_count);
    for key in keys.iter() {
        let invalid_count = || error("Invalid or inapplicable assessment technique count");
        let name = key.as_string().ok_or_else(invalid_count)?;
        entries.push((
            Technique::parse(&name).ok_or_else(invalid_count)?,
            count(&get(&counts, &name)?).ok_or_else(invalid_count)?,
        ));
    }

    let contradictory = || error("Contradictory assessment workload");
    let highest_technique = get(&workload, "highestTechnique")?;
    let highest_technique = if highest_technique.is_null() {
        None
    } else {
        Some(
            highest_technique
                .as_string()
                .and_then(|name| Technique::parse(&name))
                .ok_or_else(contradictory)?,
        )
    };
    let highest_tier = get(&workload, "highestTier")?;
    let highest_tier = if highest_tier.is_null() {
        None
    } else {
        Some(self::difficulty(&highest_tier).ok_or_else(contradictory)?)
    };

    validate_summary(&DifficultyAssessment {
        variant,
        difficulty,
        workload: ReasoningWorkload {
            steps,
            placements,
            eliminations,
            candidate_removals,
            variant_steps,
            highest_technique,
            highest_tier,
            technique_counts: TechniqueCounts::from_entries(&entries)?,
        },
    })
}

pub fn parse_outcome(value: &JsValue) -> CoreResult<AssessmentOutcomeDto> {
    if !record(value) {
        return Err(error("Invalid assessment outcome"));
    }
    let status = get(value, "status")?;
    if equals(&status, "rated") {
        return Ok(AssessmentOutcomeDto::Rated {
            summary: summary_to_dto(&parse_summary(&get(value, "summary")?)?)?,
        });
    }
    if equals(&status, "invalid") {
        let issues = issue_strings(&get(value, "issues")?)
            .filter(|issues| !issues.is_empty())
            .ok_or_else(|| error("Invalid assessment failure issues"))?;
        return Ok(AssessmentOutcomeDto::Invalid { issues });
    }
    let version = get(value, "ratingVersion")?;
    let variant = variant(&get(value, "variant")?)
        .ok_or_else(|| error("Invalid assessment outcome identity"))?;
    if !equals(&version, RATING_VERSION) {
        return Err(error("Invalid assessment outcome identity"));
    }
    if equals(&status, "ungraded") {
        return Ok(AssessmentOutcomeDto::Ungraded {
            rating_version: crate::dto::rating::RatingVersionDto::V2,
            variant: variant.into(),
        });
    }
    let stage = get(value, "stage")?;
    let tier = get(value, "difficulty")?;
    let valid_stage = if equals(&stage, "validation") {
        tier.is_null()
    } else if equals(&stage, "logic") {
        difficulty(&tier).is_some_and(|tier| supports_difficulty(variant, tier))
    } else {
        false
    };
    if equals(&status, "budget-exhausted") && valid_stage {
        return Ok(AssessmentOutcomeDto::BudgetExhausted {
            rating_version: crate::dto::rating::RatingVersionDto::V2,
            variant: variant.into(),
            stage: if equals(&stage, "validation") {
                crate::dto::rating::AssessmentStageDto::Validation
            } else {
                crate::dto::rating::AssessmentStageDto::Logic
            },
            difficulty: difficulty(&tier).map(Into::into),
        });
    }
    Err(error("Invalid assessment outcome status or stage"))
}

fn reason(value: &JsValue) -> Option<UnavailableReason> {
    match value.as_string()?.as_str() {
        "ungraded" => Some(UnavailableReason::Ungraded),
        "budget-exhausted" => Some(UnavailableReason::BudgetExhausted),
        "invalid-input" => Some(UnavailableReason::InvalidInput),
        "invalid-summary" => Some(UnavailableReason::InvalidSummary),
        "unsupported-version" => Some(UnavailableReason::UnsupportedVersion),
        "identity-mismatch" => Some(UnavailableReason::IdentityMismatch),
        _ => None,
    }
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

fn parse_stored(value: &JsValue) -> CoreResult<StoredAssessment> {
    if !record(value) {
        return Ok(StoredAssessment::Malformed {
            issues: vec!["Invalid assessment outcome".to_string()],
        });
    }
    let status = get(value, "status")?;
    if equals(&status, "unavailable")
        && let Some(reason) = reason(&get(value, "reason")?)
        && let Some(issues) = issue_strings(&get(value, "issues")?)
    {
        return Ok(StoredAssessment::Unavailable { reason, issues });
    }
    if equals(&status, "rated") {
        let summary = get(value, "summary")?;
        if record(&summary) {
            let rating_version = get(&summary, "ratingVersion")?
                .as_string()
                .unwrap_or_default();
            // Old metadata cannot be interpreted under the current mathematical schema.
            let parsed = if rating_version == RATING_VERSION {
                parse_summary(&summary).map_err(crate::issues)
            } else {
                Err(vec!["Unsupported rating version".to_owned()])
            };
            return Ok(StoredAssessment::Rated {
                rating_version,
                summary: parsed,
            });
        }
    }
    Ok(match parse_outcome(value) {
        Ok(_) => StoredAssessment::OtherOutcome,
        Err(error) => StoredAssessment::Malformed {
            issues: crate::issues(error),
        },
    })
}

pub fn decode(input: AssessmentValidationInputDto) -> CoreResult<AssessmentValidationDto> {
    if !input.present {
        return Ok(AssessmentValidationDto::Absent);
    }

    let stored = parse_stored(&input.value).unwrap_or_else(|error| StoredAssessment::Malformed {
        issues: crate::issues(error),
    });
    let identity = AssessmentIdentity {
        variant: input.identity.variant.into(),
        difficulty: input.identity.difficulty.into(),
    };

    let decoded = decode_puzzle_assessment(Some(&stored), identity);

    Ok(match decoded {
        None => AssessmentValidationDto::Absent,
        Some(PuzzleAssessment::Rated(summary)) => AssessmentValidationDto::Present {
            value: PuzzleAssessmentDto::Rated {
                summary: summary_to_dto(&summary)?,
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
