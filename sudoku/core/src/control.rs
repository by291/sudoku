//! Cooperative host cancellation without clocks or deterministic work accounting.

use std::sync::Arc;

/// A host supplies a monotonic signal; core never reads a deadline or platform clock.
pub trait CancellationProbe: std::fmt::Debug + Send + Sync {
    /// Report whether the host has requested cancellation; once set, the signal stays set.
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
    /// Create a control context without a host cancellation signal.
    pub fn new() -> Self {
        Self::default()
    }

    /// Share the host's cancellation signal for the lifetime of this context and its clones.
    pub fn with_cancellation(probe: Arc<dyn CancellationProbe>) -> Self {
        Self {
            cancellation: Some(probe),
        }
    }

    /// Returns whether computation may continue at this cooperative checkpoint.
    pub fn check(&self) -> bool {
        !self.is_cancelled()
    }

    /// Read the current host cancellation signal.
    pub fn is_cancelled(&self) -> bool {
        self.cancellation
            .as_ref()
            .is_some_and(|probe| probe.is_cancelled())
    }

    /// Settle the outcome after the caller has unwound and restored mutable state.
    pub fn finish<T>(&self, result: T) -> Controlled<T> {
        if self.is_cancelled() {
            Controlled::Cancelled
        } else {
            Controlled::Complete(result)
        }
    }
}
