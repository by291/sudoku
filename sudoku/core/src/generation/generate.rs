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

/// Uses the same scheduler and work accounting, with a separately signallable host probe.
pub fn generate_puzzle_controlled(
    input: &GenerationInput,
    limits: &GenerationLimits,
    probe: std::sync::Arc<dyn crate::budget::CancellationProbe>,
) -> CoreResult<crate::budget::Controlled<GenerationResult>> {
    limits.validate()?;
    let mut metrics = GenerationMetrics::default();
    let mut budget = WorkBudget::with_cancellation(limits.max_work, probe);
    let result = search_generation(input, limits, &mut metrics, &mut budget);
    metrics.construction_work = budget.used();
    metrics.work_by_stage = budget.accounting().clone();
    // Settle cancellation before interpreting a stopped inner operation as exhaustion or failure.
    match budget.finish(result) {
        crate::budget::Controlled::Cancelled { work_used } => {
            Ok(crate::budget::Controlled::Cancelled { work_used })
        }
        crate::budget::Controlled::Complete(result) => result.map(|outcome| {
            crate::budget::Controlled::Complete(GenerationResult { outcome, metrics })
        }),
    }
}
