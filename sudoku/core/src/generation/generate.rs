use super::search::search_generation;
use super::types::{GenerationInput, GenerationLimits, GenerationMetrics, GenerationResult};
use crate::control::ExecutionControl;
use crate::types::CoreResult;

pub fn generate_puzzle(
    input: &GenerationInput,
    limits: &GenerationLimits,
) -> CoreResult<GenerationResult> {
    generate_puzzle_with_control(input, limits, &mut ExecutionControl::new())
}

/// Runs generation with caller-owned cooperative cancellation.
pub fn generate_puzzle_with_control(
    input: &GenerationInput,
    limits: &GenerationLimits,
    control: &mut ExecutionControl,
) -> CoreResult<GenerationResult> {
    limits.validate()?;
    let mut metrics = GenerationMetrics::default();
    let outcome = search_generation(input, limits, &mut metrics, control)?;
    Ok(GenerationResult { outcome, metrics })
}

/// Uses the same deterministic scheduler with a separately signallable host probe.
pub fn generate_puzzle_controlled(
    input: &GenerationInput,
    limits: &GenerationLimits,
    probe: std::sync::Arc<dyn crate::control::CancellationProbe>,
) -> CoreResult<crate::control::Controlled<GenerationResult>> {
    limits.validate()?;
    let mut metrics = GenerationMetrics::default();
    let mut control = ExecutionControl::with_cancellation(probe);
    let result = search_generation(input, limits, &mut metrics, &mut control);
    // Settle cancellation before interpreting a stopped inner operation as exhaustion or failure.
    match control.finish(result) {
        crate::control::Controlled::Cancelled => Ok(crate::control::Controlled::Cancelled),
        crate::control::Controlled::Complete(result) => result.map(|outcome| {
            crate::control::Controlled::Complete(GenerationResult { outcome, metrics })
        }),
    }
}
