//! Wire-shape fixture decoder; semantic summary invariants are implemented by the portable core.
use crate::assessment_contracts::project_summary;
use serde::Deserialize;
use serde_json::{Value, json};
use sudoku_core::logic::techniques::Technique;
use sudoku_core::rating::decoding::{decode_puzzle_assessment, validate_summary};
use sudoku_core::rating::types::{
    AssessmentIdentity, DifficultyAssessment, PuzzleAssessment, RATING_VERSION, ReasoningWorkload,
    StoredAssessment, TechniqueCounts, UnavailableReason,
};
use sudoku_core::rules::types::SudokuVariant;
use sudoku_core::types::{CoreResult, Difficulty, EngineError};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MetadataInput {
    operation: String,
    present: bool,
    #[serde(default)]
    value: Value,
    identity: IdentityDto,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct IdentityDto {
    variant: String,
    difficulty: String,
}

fn variant(value: &str) -> Option<SudokuVariant> {
    match value {
        "classic" => Some(SudokuVariant::Classic),
        "diagonal" => Some(SudokuVariant::Diagonal),
        "jigsaw" => Some(SudokuVariant::Jigsaw),
        "killer" => Some(SudokuVariant::Killer),
        "thermo" => Some(SudokuVariant::Thermo),
        "arrow" => Some(SudokuVariant::Arrow),
        _ => None,
    }
}

fn difficulty(value: &str) -> Option<Difficulty> {
    Difficulty::ALL
        .into_iter()
        .find(|difficulty| difficulty.as_str() == value)
}

fn count(value: Option<&Value>) -> Option<u64> {
    value?.as_u64().filter(|&count| count <= 9007199254740991)
}

fn error(message: &str) -> EngineError {
    EngineError::invalid(message)
}

pub fn issues(error: EngineError) -> Vec<String> {
    match error {
        EngineError::InvalidInput(issues) => issues,
        error => vec![error.to_string()],
    }
}

pub fn parse_summary(value: &Value) -> CoreResult<DifficultyAssessment> {
    let identity_error = || error("Invalid assessment summary identity");
    if !value.is_object() || value["ratingVersion"] != RATING_VERSION {
        return Err(identity_error());
    }
    let variant = value["variant"]
        .as_str()
        .and_then(variant)
        .ok_or_else(identity_error)?;
    let difficulty = value["difficulty"]
        .as_str()
        .and_then(difficulty)
        .ok_or_else(identity_error)?;
    if !sudoku_core::rating::policies::supports_difficulty(variant, difficulty) {
        return Err(identity_error());
    }
    let workload = value
        .get("workload")
        .filter(|value| value.is_object())
        .ok_or_else(identity_error)?;
    let workload_error = || error("Invalid assessment workload counts");
    let steps = count(workload.get("steps")).ok_or_else(workload_error)?;
    let placements = count(workload.get("placements")).ok_or_else(workload_error)?;
    let eliminations = count(workload.get("eliminations")).ok_or_else(workload_error)?;
    let candidate_removals = count(workload.get("candidateRemovals")).ok_or_else(workload_error)?;
    let variant_steps = count(workload.get("variantSteps")).ok_or_else(workload_error)?;
    let counts = workload["techniqueCounts"]
        .as_object()
        .ok_or_else(workload_error)?;
    if counts.len() != 17 {
        return Err(error(
            "Assessment technique counts must include every known technique",
        ));
    }
    let mut entries = vec![];
    for (name, value) in counts {
        let invalid_count = || error("Invalid or inapplicable assessment technique count");
        entries.push((
            Technique::parse(name).ok_or_else(invalid_count)?,
            count(Some(value)).ok_or_else(invalid_count)?,
        ));
    }
    let contradictory = || error("Contradictory assessment workload");
    let highest_technique = match workload.get("highestTechnique") {
        Some(Value::Null) => None,
        Some(Value::String(value)) => Some(Technique::parse(value).ok_or_else(contradictory)?),
        _ => return Err(contradictory()),
    };
    let highest_tier = match workload.get("highestTier") {
        Some(Value::Null) => None,
        Some(Value::String(value)) => {
            Some(crate::assessment_contracts::difficulty(value).map_err(|_| contradictory())?)
        }
        _ => return Err(contradictory()),
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

fn parse_issues(value: &Value) -> Option<Vec<String>> {
    value
        .as_array()?
        .iter()
        .map(|value| {
            value
                .as_str()
                .filter(|issue| !issue.trim().is_empty())
                .map(str::to_string)
        })
        .collect()
}

fn parse_outcome(value: &Value) -> CoreResult<Value> {
    if !value.is_object() {
        return Err(error("Invalid assessment outcome"));
    }
    if value["status"] == "rated" {
        return Ok(
            json!({"status":"rated","summary":project_summary(&parse_summary(&value["summary"])?) }),
        );
    }
    if value["status"] == "invalid" {
        let issues = parse_issues(&value["issues"])
            .filter(|issues| !issues.is_empty())
            .ok_or_else(|| error("Invalid assessment failure issues"))?;
        return Ok(json!({"status":"invalid","issues":issues}));
    }
    if value["ratingVersion"] != RATING_VERSION
        || value["variant"].as_str().and_then(variant).is_none()
    {
        return Err(error("Invalid assessment outcome identity"));
    }
    let mut result = json!({"ratingVersion":RATING_VERSION,"variant":value["variant"]});
    if value["status"] == "ungraded" {
        result["status"] = json!("ungraded");
        return Ok(result);
    }
    let valid_stage = if value["stage"] == "validation" {
        value.get("difficulty") == Some(&Value::Null)
    } else if value["stage"] == "logic" {
        match (
            value["variant"].as_str().and_then(variant),
            value["difficulty"].as_str().and_then(difficulty),
        ) {
            (Some(variant), Some(difficulty)) => {
                sudoku_core::rating::policies::supports_difficulty(variant, difficulty)
            }
            _ => false,
        }
    } else {
        false
    };
    if value["status"] == "budget-exhausted" && valid_stage {
        result["status"] = json!("budget-exhausted");
        result["stage"] = value["stage"].clone();
        result["difficulty"] = value["difficulty"].clone();
        return Ok(result);
    }
    Err(error("Invalid assessment outcome status or stage"))
}

fn reason(value: &str) -> Option<UnavailableReason> {
    match value {
        "ungraded" => Some(UnavailableReason::Ungraded),
        "budget-exhausted" => Some(UnavailableReason::BudgetExhausted),
        "invalid-input" => Some(UnavailableReason::InvalidInput),
        "invalid-summary" => Some(UnavailableReason::InvalidSummary),
        "unsupported-version" => Some(UnavailableReason::UnsupportedVersion),
        "identity-mismatch" => Some(UnavailableReason::IdentityMismatch),
        _ => None,
    }
}

fn reason_name(reason: UnavailableReason) -> &'static str {
    match reason {
        UnavailableReason::Ungraded => "ungraded",
        UnavailableReason::BudgetExhausted => "budget-exhausted",
        UnavailableReason::InvalidInput => "invalid-input",
        UnavailableReason::InvalidSummary => "invalid-summary",
        UnavailableReason::UnsupportedVersion => "unsupported-version",
        UnavailableReason::IdentityMismatch => "identity-mismatch",
    }
}

fn parse_stored(value: &Value) -> StoredAssessment {
    if value["status"] == "unavailable"
        && let Some(reason) = value["reason"].as_str().and_then(reason)
        && let Some(issues) = parse_issues(&value["issues"])
    {
        return StoredAssessment::Unavailable { reason, issues };
    }
    if value["status"] == "rated" && value["summary"].is_object() {
        let summary = &value["summary"];
        return StoredAssessment::Rated {
            rating_version: summary["ratingVersion"].as_str().unwrap_or("").to_string(),
            summary: parse_summary(summary).map_err(issues),
        };
    }
    match parse_outcome(value) {
        Ok(_) => StoredAssessment::OtherOutcome,
        Err(error) => StoredAssessment::Malformed {
            issues: issues(error),
        },
    }
}

pub fn evaluate(input: MetadataInput) -> Result<Value, Box<dyn std::error::Error>> {
    match input.operation.as_str() {
        "summary" => Ok(match parse_summary(&input.value) {
            Ok(summary) => json!({"valid":true,"value":project_summary(&summary)}),
            Err(error) => json!({"valid":false,"issues":issues(error)}),
        }),
        "outcome" => Ok(match parse_outcome(&input.value) {
            Ok(value) => json!({"valid":true,"value":value}),
            Err(error) => json!({"valid":false,"issues":issues(error)}),
        }),
        "decode" => {
            let identity = AssessmentIdentity {
                variant: variant(&input.identity.variant).ok_or("Unknown fixture variant")?,
                difficulty: difficulty(&input.identity.difficulty)
                    .ok_or("Unknown fixture difficulty")?,
            };
            let record = input.present.then(|| parse_stored(&input.value));
            let decoded = decode_puzzle_assessment(record.as_ref(), identity);
            Ok(match decoded {
                None => json!({"present":false}),
                Some(PuzzleAssessment::Rated(summary)) => {
                    json!({"present":true,"value":{"status":"rated","summary":project_summary(&summary)}})
                }
                Some(PuzzleAssessment::Unavailable { reason, issues }) => {
                    json!({"present":true,"value":{"status":"unavailable","reason":reason_name(reason),"issues":issues}})
                }
            })
        }
        _ => Err("Unknown fixture metadata operation".into()),
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ValidationInput {
    puzzle: Value,
}

pub fn evaluate_validation(input: ValidationInput) -> Result<Value, Box<dyn std::error::Error>> {
    let value = &input.puzzle;
    if value["difficulty"].as_str().and_then(difficulty).is_none()
        || !value["seed"].as_str().is_some_and(|seed| !seed.is_empty())
        || !value["puzzleVersion"]
            .as_str()
            .is_some_and(|version| !version.is_empty())
    {
        return Ok(json!({"valid":false,"issues":["Invalid puzzle metadata"],"workUsed":0}));
    }
    let puzzle = match crate::fixtures::decode_puzzle(value) {
        Ok(puzzle) => puzzle,
        Err(_) => {
            return Ok(
                json!({"valid":false,"issues":["Invalid puzzle board or rules"],"workUsed":0}),
            );
        }
    };
    match sudoku_core::puzzle::validate_puzzle(&puzzle) {
        Err(error) => Ok(json!({"valid":false,"issues":issues(error),"workUsed":0})),
        Ok(()) => Ok(
            json!({"valid":true,"value":{"givens":puzzle.givens.values().to_vec(),"solution":puzzle.solution.values().to_vec(),"difficulty":puzzle.difficulty.as_str(),"rules":crate::fixtures::project_rule_value(&puzzle.rules),"seed":value["seed"],"puzzleVersion":value["puzzleVersion"]},"workUsed":0}),
        ),
    }
}
