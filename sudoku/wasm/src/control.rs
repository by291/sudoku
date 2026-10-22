//! Browser-owned monotonic deadlines; one control is shared by all nested core calls.
use std::sync::Arc;
use sudoku_core::control::{CancellationProbe, ExecutionControl};
use wasm_bindgen::JsError;

const COMPUTATION_TIMEOUT_MS: f64 = 3_000.0;

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
extern "C" {
    #[wasm_bindgen::prelude::wasm_bindgen(catch, js_namespace = ["globalThis", "performance"], js_name = now)]
    fn monotonic_now() -> Result<f64, wasm_bindgen::JsValue>;
}

#[cfg(target_arch = "wasm32")]
fn now() -> f64 {
    // Fail closed if a host has no monotonic clock; never run unbounded as a fallback.
    monotonic_now().unwrap_or(f64::NAN)
}

#[cfg(target_arch = "wasm32")]
#[derive(Debug)]
struct Deadline {
    expires_at: f64,
}

#[cfg(target_arch = "wasm32")]
impl CancellationProbe for Deadline {
    fn is_cancelled(&self) -> bool {
        let now = now();
        !now.is_finite() || !self.expires_at.is_finite() || now >= self.expires_at
    }
}

#[cfg(not(target_arch = "wasm32"))]
#[derive(Debug)]
struct Deadline {
    started_at: std::time::Instant,
}

#[cfg(not(target_arch = "wasm32"))]
impl CancellationProbe for Deadline {
    fn is_cancelled(&self) -> bool {
        self.started_at.elapsed().as_secs_f64() * 1_000.0 >= COMPUTATION_TIMEOUT_MS
    }
}

pub fn execution() -> ExecutionControl {
    #[cfg(target_arch = "wasm32")]
    let deadline = Deadline {
        expires_at: now() + COMPUTATION_TIMEOUT_MS,
    };
    #[cfg(not(target_arch = "wasm32"))]
    let deadline = Deadline {
        started_at: std::time::Instant::now(),
    };
    ExecutionControl::with_cancellation(Arc::new(deadline))
}

pub fn check(control: &ExecutionControl) -> Result<(), JsError> {
    if !control.check() {
        return Err(JsError::new("Computation timed out"));
    }
    Ok(())
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;

    #[test]
    fn expired_deadline_cancels_without_elapsed_work_accounting() {
        let deadline = Deadline {
            started_at: std::time::Instant::now() - std::time::Duration::from_secs(4),
        };
        let control = ExecutionControl::with_cancellation(Arc::new(deadline));

        assert!(control.is_cancelled());
        assert!(!control.check());
    }
}
