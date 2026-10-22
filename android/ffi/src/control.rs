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
/// Computation observes the signal at cancellation checkpoints and unwinds before returning an error.
#[derive(Debug, Default, uniffi::Object)]
pub struct CancellationToken {
    cancelled: AtomicBool,
}

#[uniffi::export]
impl CancellationToken {
    #[uniffi::constructor]
    pub fn new() -> Self {
        Self::default()
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Relaxed);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Relaxed)
    }
}

impl CancellationProbe for CancellationToken {
    fn is_cancelled(&self) -> bool {
        self.is_cancelled()
    }
}

pub fn execution(token: Arc<CancellationToken>) -> Result<ExecutionControl, NativeError> {
    let control = ExecutionControl::with_cancellation(token);
    check(&control)?;
    Ok(control)
}

pub fn check(control: &ExecutionControl) -> Result<(), NativeError> {
    if !control.check() {
        return Err(NativeError::Cancelled);
    }
    Ok(())
}
