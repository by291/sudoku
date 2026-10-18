//! Projection of sealed assessment evidence for native regression assertions.
use serde_json::{Value, json};
use sudoku_core::logic::techniques::ALL_TECHNIQUES;
use sudoku_core::rating::types::{DifficultyAssessment, RATING_VERSION};
use sudoku_core::types::Difficulty;

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

    json!({
        "ratingVersion": RATING_VERSION,
        "variant": summary.variant.as_str(),
        "difficulty": summary.difficulty.as_str(),
        "workload": {
            "steps": workload.steps,
            "placements": workload.placements,
            "eliminations": workload.eliminations,
            "candidateRemovals": workload.candidate_removals,
            "techniqueCounts": counts,
            "highestTier": workload.highest_tier.map(Difficulty::as_str),
            "highestTechnique": workload.highest_technique.map(|technique| technique.as_str()),
            "variantSteps": workload.variant_steps,
        }
    })
}
