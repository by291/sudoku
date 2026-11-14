use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use sudoku_core::control::{CancellationProbe, ExecutionControl};
use sudoku_core::types::EngineError;

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum NativeError {
    #[error("Invalid input: {reason}")]
    InvalidInput { reason: String },
    #[error("Operation cancelled")]
    Cancelled,
    #[error("Computation incomplete")]
    Incomplete,
}

impl From<EngineError> for NativeError {
    fn from(error: EngineError) -> Self {
        Self::InvalidInput {
            reason: error.to_string(),
        }
    }
}

/// A sticky cancellation signal shared by the operations that receive this token.
///
/// Cancellation never waits on a prepared handle or computation lock. Once cancelled,
/// the token stays cancelled for its entire lifetime; use a fresh token for a new job.
/// Computation observes cancellation at checkpoints and unwinds before returning an error.
#[derive(Debug, Default, uniffi::Object)]
pub struct CancellationToken {
    cancelled: AtomicBool,
}

#[uniffi::export]
impl CancellationToken {
    #[uniffi::constructor]
    /// Create a fresh uncancelled signal for one request.
    pub fn new() -> Self {
        Self::default()
    }

    /// Signal cancellation without taking a prepared puzzle's computation lock.
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Relaxed);
    }

    /// Report whether cancellation has been signalled.
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Relaxed)
    }
}

impl CancellationProbe for CancellationToken {
    fn is_cancelled(&self) -> bool {
        self.is_cancelled()
    }
}

/// Attach the caller's token and reject an already cancelled operation.
pub fn execution(token: Arc<CancellationToken>) -> Result<ExecutionControl, NativeError> {
    let control = ExecutionControl::with_cancellation(token);
    check(&control)?;
    Ok(control)
}

/// Keep a cancelled computation distinct from any partial core result.
pub fn check(control: &ExecutionControl) -> Result<(), NativeError> {
    if !control.check() {
        return Err(NativeError::Cancelled);
    }

    Ok(())
}
