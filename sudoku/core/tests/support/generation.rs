//! Native fixture conversion keeps serialization outside the portable engine.
use crate::assessment_projection::project_summary;
use crate::fixtures::project_rule_value;
use serde_json::{Value, json};
use sudoku_core::generation::types::{
    GenerationExhaustionCause, GenerationOutcome, GenerationResult,
};

pub fn project_result(result: &GenerationResult) -> Value {
    let metrics = &result.metrics;
    let mut value = json!({
        "metrics": {
            "layouts": metrics.layouts,
            "completedLayouts": metrics.completed_layouts,
            "candidateVisits": metrics.candidate_visits,
        }
    });

    match &result.outcome {
        GenerationOutcome::Ready { puzzle, assessment } => {
            let content = &puzzle.content;
            let seed: String = puzzle
                .seed
                .as_bytes()
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect();
            value["status"] = json!("ready");
            value["source"] = json!("generated");
            value["assessment"] = project_summary(assessment);
            value["puzzle"] = json!({
                "givens": content.givens.values().to_vec(),
                "solution": content.solution.values().to_vec(),
                "rules": project_rule_value(&content.rules),
                "difficulty": content.difficulty.as_str(),
                "seed": seed,
                "puzzleVersion": puzzle.puzzle_version.as_str(),
            });
        }
        GenerationOutcome::Incomplete { cause } => {
            value["status"] = json!("budget-exhausted");
            value["stage"] = json!("construction");
            value["cause"] = json!(match cause {
                GenerationExhaustionCause::Cancelled => "work-limit",
                GenerationExhaustionCause::LogicalStepLimit => "logical-step-limit",
                GenerationExhaustionCause::LayoutLimit => "layout-limit",
                GenerationExhaustionCause::ExhaustedFrontier => "exhausted-frontier",
            });
        }
        GenerationOutcome::Failed { reason } => {
            value["status"] = json!("failed");
            value["reason"] = json!(reason);
        }
    }

    value
}
