use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use sudoku_core::budget::{CancellationProbe, WorkBudget};
use sudoku_core::types::EngineError;

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum NativeError {
    #[error("Invalid input: {reason}")]
    InvalidInput { reason: String },
    #[error("Operation cancelled after {work_used} work units")]
    Cancelled { work_used: u64 },
    #[error("Preparation exhausted after {work_used} work units")]
    BudgetExhausted { work_used: u64 },
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
/// Computation observes the signal at work checks and unwinds before returning an error.
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

pub fn budget(
    maximum: Option<u32>,
    initial: Option<u32>,
    token: Arc<CancellationToken>,
) -> Result<WorkBudget, NativeError> {
    let maximum = maximum.unwrap_or(1_000_000);
    if maximum > 4_000_000 || initial.unwrap_or(0) > maximum {
        return Err(EngineError::invalid("Work limits may only lower the fixed bounds").into());
    }

    let mut budget = WorkBudget::with_cancellation(u64::from(maximum), token);
    check(&budget)?;
    budget.consume(u64::from(initial.unwrap_or(0)));
    check(&budget)?;

    Ok(budget)
}

pub fn check(budget: &WorkBudget) -> Result<(), NativeError> {
    if budget.is_cancelled() {
        return Err(NativeError::Cancelled {
            work_used: budget.used(),
        });
    }

    Ok(())
}
