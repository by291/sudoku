use crate::fixtures::project_rule_value;
use serde::Deserialize;
use serde_json::{Value, json};
use sudoku_core::budget::WorkBudget;
use sudoku_core::generation::layouts::construct_generation_layout;
use sudoku_core::generation::random::{RandomPhase, for_phase};
use sudoku_core::generation::types::{GenerationInput, LayoutConstructionResult};
use sudoku_core::random::Seed;
use sudoku_core::rules::types::SudokuVariant;
use sudoku_core::types::Difficulty;

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct LayoutInput {
    seed: Vec<u8>,
    variant: String,
    difficulty: String,
    puzzle_version: String,
    layout: u32,
    limit: u64,
}

pub fn variant(value: &str) -> Option<SudokuVariant> {
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

pub fn evaluate_layout(input: LayoutInput) -> Result<Value, Box<dyn std::error::Error>> {
    let request = GenerationInput::from_version(
        variant(&input.variant).ok_or("Unknown fixture variant")?,
        Difficulty::ALL
            .into_iter()
            .find(|difficulty| difficulty.as_str() == input.difficulty)
            .ok_or("Unknown fixture difficulty")?,
        Seed::try_from(input.seed.as_slice())?,
        &input.puzzle_version,
    )?;
    let mut terminal_random = for_phase(&request, RandomPhase::Terminal, input.layout, 0);
    let mut geometry_random = for_phase(&request, RandomPhase::Geometry, input.layout, 0);
    let mut budget = WorkBudget::new(input.limit);
    let result = match construct_generation_layout(
        &request,
        &mut terminal_random,
        &mut geometry_random,
        &mut budget,
    )? {
        LayoutConstructionResult::Ready { terminal, rules } => {
            json!({"status":"ready","terminal":terminal.values().to_vec(),"rules":project_rule_value(&rules)})
        }
        LayoutConstructionResult::BudgetExhausted => json!({"status":"budget-exhausted"}),
        LayoutConstructionResult::AttemptExhausted => json!({"status":"attempt-exhausted"}),
        LayoutConstructionResult::Failed { reason } => json!({"status":"failed","reason":reason}),
    };
    Ok(
        json!({"result":result,"workUsed":budget.used(),"nextTerminal":terminal_random.next_f64(),"nextGeometry":geometry_random.next_f64()}),
    )
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GenerationInputDto {
    seed: Vec<u8>,
    variant: String,
    difficulty: String,
    puzzle_version: String,
    #[serde(default)]
    limits: Option<GenerationLimitsDto>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct GenerationLimitsDto {
    max_layouts: u32,
    max_work: u64,
    max_steps: u32,
}

pub fn evaluate(input: GenerationInputDto) -> Result<Value, Box<dyn std::error::Error>> {
    use sudoku_core::budget::WorkStage;
    use sudoku_core::generation::generate::generate_puzzle;
    use sudoku_core::generation::types::{
        GenerationExhaustionCause, GenerationLimits, GenerationOutcome,
    };
    use sudoku_core::rating::assessment::{assess_puzzle, assess_puzzle_with_budget};
    use sudoku_core::rating::input::create_assessment_input;
    use sudoku_core::rating::types::AssessmentLimits;

    let request = GenerationInput::from_version(
        variant(&input.variant).ok_or("Unknown fixture variant")?,
        Difficulty::ALL
            .into_iter()
            .find(|difficulty| difficulty.as_str() == input.difficulty)
            .ok_or("Unknown fixture difficulty")?,
        Seed::try_from(input.seed.as_slice())?,
        &input.puzzle_version,
    )?;
    let limits = input
        .limits
        .map_or_else(GenerationLimits::default, |limits| GenerationLimits {
            max_layouts: limits.max_layouts,
            max_work: limits.max_work,
            max_steps: limits.max_steps,
        });
    let result = generate_puzzle(&request, &limits)?;
    let metrics = result.metrics;
    let by_stage: serde_json::Map<String, Value> = WorkStage::ALL
        .into_iter()
        .map(|stage| {
            (
                stage.name().to_string(),
                json!(metrics.work_by_stage.used(stage)),
            )
        })
        .collect();
    let mut projected = json!({"metrics":{"constructionWork":metrics.construction_work,"layouts":metrics.layouts,"completedLayouts":metrics.completed_layouts,"candidateVisits":metrics.candidate_visits,"workByStage":by_stage}});
    let mut standalone = None;
    match result.outcome {
        GenerationOutcome::Ready { puzzle, assessment } => {
            let content = &puzzle.content;
            let seed: String = puzzle
                .seed
                .as_bytes()
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect();
            projected["status"] = json!("ready");
            projected["source"] = json!("generated");
            projected["assessment"] = crate::assessment_contracts::project_summary(&assessment);
            projected["puzzle"] = json!({"givens":content.givens.values().to_vec(),"solution":content.solution.values().to_vec(),"rules":project_rule_value(&content.rules),"difficulty":content.difficulty.as_str(),"seed":seed,"puzzleVersion":puzzle.puzzle_version.as_str()});
            let input = create_assessment_input(
                &content.givens,
                &content.rules,
                AssessmentLimits::default(),
            );
            let first = assess_puzzle(&input);
            let second = assess_puzzle_with_budget(&input, &mut WorkBudget::new(4000000));
            standalone = Some(
                json!({"result":crate::assessment_contracts::project_result(&first),"budgeted":crate::assessment_contracts::project_result(&second)}),
            );
        }
        GenerationOutcome::BudgetExhausted { cause } => {
            projected["status"] = json!("budget-exhausted");
            projected["stage"] = json!("construction");
            projected["cause"] = json!(match cause {
                GenerationExhaustionCause::WorkLimit => "work-limit",
                GenerationExhaustionCause::LogicalStepLimit => "logical-step-limit",
                GenerationExhaustionCause::LayoutLimit => "layout-limit",
                GenerationExhaustionCause::ExhaustedFrontier => "exhausted-frontier",
            });
        }
        GenerationOutcome::Failed { reason } => {
            projected["status"] = json!("failed");
            projected["reason"] = json!(reason);
        }
    }
    let mut value = json!({"result":projected});
    if let Some(assessment) = standalone {
        value["assessment"] = assessment;
    }
    Ok(value)
}
