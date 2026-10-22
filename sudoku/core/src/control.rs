//! Cooperative host cancellation without clocks or deterministic work accounting.
use std::sync::Arc;

/// A host supplies a monotonic signal; core never reads a deadline or platform clock.
pub trait CancellationProbe: std::fmt::Debug + Send + Sync {
    fn is_cancelled(&self) -> bool;
}

/// Cancellation is settled after the computation unwinds and restores its mutable state.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Controlled<T> {
    Complete(T),
    Cancelled,
}

/// Shared cancellation context. Local algorithm limits remain owned by each algorithm.
#[derive(Clone, Debug, Default)]
pub struct ExecutionControl {
    cancellation: Option<Arc<dyn CancellationProbe>>,
}

impl ExecutionControl {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_cancellation(probe: Arc<dyn CancellationProbe>) -> Self {
        Self {
            cancellation: Some(probe),
        }
    }

    /// Returns whether computation may continue at this cooperative checkpoint.
    pub fn check(&self) -> bool {
        !self.is_cancelled()
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancellation
            .as_ref()
            .is_some_and(|probe| probe.is_cancelled())
    }

    pub fn finish<T>(&self, result: T) -> Controlled<T> {
        if self.is_cancelled() {
            Controlled::Cancelled
        } else {
            Controlled::Complete(result)
        }
    }
}
