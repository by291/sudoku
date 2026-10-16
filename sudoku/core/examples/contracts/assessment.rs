use crate::fixtures::decode_rules;
use crate::logical_projection::project_step;
use crate::violation_projection;
use serde::Deserialize;
use serde_json::{Value, json};
use sudoku_core::budget::WorkBudget;
use sudoku_core::constraints::computation::prepare_computation;
use sudoku_core::logic::techniques::ALL_TECHNIQUES;
use sudoku_core::rating::assessment::{
    assess_puzzle, assess_puzzle_with_budget, prepare_assessment,
    prepare_assessment_with_computation,
};
use sudoku_core::rating::input::create_assessment_input;
use sudoku_core::rating::types::{
    AssessmentFailure, AssessmentIssue, AssessmentLimits, AssessmentResult, AssessmentStage,
    DifficultyAssessment, ExhaustionCause, RATING_VERSION, RatedAssessment, TargetScreenResult,
    TrialAssessmentResult,
};
use sudoku_core::types::{Board, Bounded, Difficulty};

type FixtureResult = Result<Value, Box<dyn std::error::Error>>;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AssessmentInputDto {
    board: Vec<u8>,
    rules: Value,
    limit: u64,
    #[serde(rename = "solution")]
    _solution: Vec<u8>,
    #[serde(rename = "difficulty")]
    _difficulty: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct LimitsDto {
    max_steps: u32,
    max_work: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum Mode {
    Assess,
    Screen,
    Target,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ScreeningInput {
    board: Vec<u8>,
    rules: Value,
    limits: LimitsDto,
    prepared: bool,
    mode: Mode,
    target: Option<String>,
    work_limit: u64,
    initial_work: u64,
    repeats: usize,
}

pub fn difficulty(value: &str) -> Result<Difficulty, &'static str> {
    Difficulty::ALL
        .into_iter()
        .find(|difficulty| difficulty.as_str() == value)
        .ok_or("Unknown fixture difficulty")
}

pub fn project_summary(summary: &DifficultyAssessment) -> Value {
    let workload = &summary.workload;
    let counts: serde_json::Map<String, Value> = ALL_TECHNIQUES
        .into_iter()
        .map(|technique| {
            (
                technique.as_str().to_string(),
                json!(workload.technique_counts.count(technique)),
            )
        })
        .collect();
    json!({"ratingVersion":RATING_VERSION,"variant":summary.variant.as_str(),"difficulty":summary.difficulty.as_str(),"workload":{"steps":workload.steps,"placements":workload.placements,"eliminations":workload.eliminations,"candidateRemovals":workload.candidate_removals,"techniqueCounts":counts,"highestTier":workload.highest_tier.map(Difficulty::as_str),"highestTechnique":workload.highest_technique.map(|technique|technique.as_str()),"variantSteps":workload.variant_steps}})
}

fn project_issues(issues: &[AssessmentIssue]) -> Vec<String> {
    issues
        .iter()
        .map(|issue| match issue {
            AssessmentIssue::Message(message) => message.clone(),
            AssessmentIssue::Violation(violation) => format!(
                "{}: {}",
                violation.constraint_id,
                violation_projection::message(violation)
            ),
        })
        .collect()
}

pub fn project_failure(failure: &AssessmentFailure) -> Value {
    match failure {
        AssessmentFailure::Ungraded { variant } => {
            json!({"status":"ungraded","ratingVersion":RATING_VERSION,"variant":variant.as_str()})
        }
        AssessmentFailure::BudgetExhausted {
            variant,
            stage,
            difficulty,
        } => {
            json!({"status":"budget-exhausted","ratingVersion":RATING_VERSION,"variant":variant.as_str(),"stage":match stage { AssessmentStage::Validation => "validation", AssessmentStage::Logic => "logic" },"difficulty":difficulty.map(Difficulty::as_str)})
        }
        AssessmentFailure::Invalid { issues } => {
            json!({"status":"invalid","issues":project_issues(issues)})
        }
    }
}

pub fn project_rated(rated: &RatedAssessment) -> Value {
    json!({"status":"rated","summary":project_summary(&rated.summary),"trace":rated.trace.iter().map(project_step).collect::<Vec<_>>()})
}

pub fn project_result(result: &AssessmentResult) -> Value {
    match result {
        AssessmentResult::Rated(rated) => project_rated(rated),
        AssessmentResult::Unrated(failure) => project_failure(failure),
    }
}

pub fn evaluate(input: AssessmentInputDto) -> FixtureResult {
    let board = Board::try_from(input.board.as_slice())?;
    let rules = decode_rules(&input.rules)?;
    let request = create_assessment_input(&board, &rules, AssessmentLimits::default());
    let mut budget = WorkBudget::new(input.limit);
    let result = assess_puzzle(&request);
    let budgeted = assess_puzzle_with_budget(&request, &mut budget);
    Ok(
        json!({"result":project_result(&result),"budgeted":project_result(&budgeted),"workUsed":budget.used()}),
    )
}

pub fn evaluate_screening(input: ScreeningInput) -> FixtureResult {
    let board = Board::try_from(input.board.as_slice())?;
    let rules = decode_rules(&input.rules)?;
    let limits = AssessmentLimits {
        max_steps: input.limits.max_steps,
        max_work: input.limits.max_work,
    };
    let mut preparation_work = 0;
    let owner = if input.prepared {
        let mut setup = WorkBudget::new(4000000);
        let Bounded::Complete(computation) = prepare_computation(&rules, &mut setup)? else {
            return Err("Expected prepared fixture layout".into());
        };
        preparation_work = setup.used();
        prepare_assessment_with_computation(&computation, limits)?
    } else {
        prepare_assessment(&rules, limits)?
    };
    let mut budget = WorkBudget::new(input.work_limit);
    if !budget.consume(input.initial_work) {
        return Err("Invalid fixture initial work".into());
    }
    let mut results = vec![];
    for _ in 0..input.repeats {
        let result = match input.mode {
            Mode::Assess => project_result(&owner.assess(&board, &mut budget)),
            Mode::Screen => match owner.screen(&board, &mut budget) {
                TrialAssessmentResult::Unrated(failure) => project_failure(&failure),
                TrialAssessmentResult::Rated(trial) => {
                    let difficulty = trial.difficulty();
                    json!({"status":"rated","difficulty":difficulty.as_str(),"completed":project_rated(&trial.complete()?)})
                }
            },
            Mode::Target => {
                let target = difficulty(input.target.as_deref().ok_or("Missing fixture target")?)?;
                match owner.screen_target(&board, target, &mut budget) {
                    TargetScreenResult::BelowTarget { trial, feedback }
                    | TargetScreenResult::MatchingTarget { trial, feedback } => {
                        let difficulty = trial.difficulty();
                        let status = if difficulty == target {
                            "matching-target"
                        } else {
                            "below-target"
                        };
                        json!({"status":status,"difficulty":difficulty.as_str(),"feedback":{"remainingCells":feedback.remaining_cells,"deductions":feedback.deductions},"completed":project_rated(&trial.complete()?)})
                    }
                    TargetScreenResult::TargetStalled { feedback } => {
                        json!({"status":"target-stalled","feedback":{"remainingCells":feedback.remaining_cells,"deductions":feedback.deductions}})
                    }
                    TargetScreenResult::BudgetExhausted { cause } => {
                        json!({"status":"budget-exhausted","cause":match cause { ExhaustionCause::WorkLimit => "work-limit", ExhaustionCause::LogicalStepLimit => "logical-step-limit" }})
                    }
                    TargetScreenResult::Invalid { issues } => {
                        json!({"status":"invalid","issues":project_issues(&issues)})
                    }
                }
            }
        };
        results.push(result);
    }
    Ok(json!({"results":results,"used":budget.used(),"preparationWork":preparation_work}))
}
