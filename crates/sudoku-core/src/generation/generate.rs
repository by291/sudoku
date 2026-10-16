use super::search::search_generation;
use super::types::{GenerationInput, GenerationLimits, GenerationMetrics, GenerationResult};
use crate::budget::WorkBudget;
use crate::types::CoreResult;

pub fn generate_puzzle(
    input: &GenerationInput,
    limits: &GenerationLimits,
) -> CoreResult<GenerationResult> {
    limits.validate()?;
    let mut metrics = GenerationMetrics::default();
    let mut budget = WorkBudget::new(limits.max_work);
    let result = search_generation(input, limits, &mut metrics, &mut budget);
    // Account for every completed or abandoned operation, including the final failed charge path.
    metrics.construction_work = budget.used();
    metrics.work_by_stage = budget.accounting().clone();
    result.map(|outcome| GenerationResult { outcome, metrics })
}
