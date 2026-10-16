//! Finite deterministic work accounting shared by preparation, search and reasoning.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(usize)]
pub enum WorkStage {
    Preparation = 0,
    Arithmetic = 1,
    Exact = 2,
    Logic = 3,
    Proposals = 4,
}

impl WorkStage {
    pub const ALL: [Self; 5] = [
        Self::Preparation,
        Self::Arithmetic,
        Self::Exact,
        Self::Logic,
        Self::Proposals,
    ];

    pub fn name(self) -> &'static str {
        match self {
            Self::Preparation => "preparation",
            Self::Arithmetic => "arithmetic",
            Self::Exact => "exact",
            Self::Logic => "logic",
            Self::Proposals => "proposals",
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct WorkAccounting {
    by_stage: [u64; WorkStage::ALL.len()],
}

impl WorkAccounting {
    pub fn used(&self, stage: WorkStage) -> u64 {
        self.by_stage[stage as usize]
    }

    pub fn total(&self) -> u64 {
        self.by_stage.iter().sum()
    }
}

/// A host supplies only a signal; core never reads a deadline, runtime, or platform clock.
pub trait CancellationProbe: std::fmt::Debug + Send + Sync {
    fn is_cancelled(&self) -> bool;
}

/// Cancellation is settled after work has unwound normally, preserving restoration and charges.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Controlled<T> {
    Complete(T),
    Cancelled { work_used: u64 },
}

#[derive(Clone, Debug)]
pub struct WorkBudget {
    limit: u64,
    used: u64,
    exhausted: bool,
    stage: WorkStage,
    accounting: WorkAccounting,
    cancellation: Option<std::sync::Arc<dyn CancellationProbe>>,
}

impl WorkBudget {
    pub fn new(limit: u64) -> Self {
        Self {
            limit,
            used: 0,
            exhausted: false,
            stage: WorkStage::Preparation,
            accounting: WorkAccounting::default(),
            cancellation: None,
        }
    }

    pub fn with_cancellation(limit: u64, probe: std::sync::Arc<dyn CancellationProbe>) -> Self {
        Self {
            cancellation: Some(probe),
            ..Self::new(limit)
        }
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancellation
            .as_ref()
            .is_some_and(|probe| probe.is_cancelled())
    }

    pub fn finish<T>(&self, result: T) -> Controlled<T> {
        if self.is_cancelled() {
            Controlled::Cancelled {
                work_used: self.used,
            }
        } else {
            Controlled::Complete(result)
        }
    }

    /// True after a rejected work charge, independently of cancellation and unspent remainder.
    pub fn is_exhausted(&self) -> bool {
        self.exhausted
    }

    pub fn used(&self) -> u64 {
        self.used
    }

    pub fn remaining(&self) -> u64 {
        self.limit - self.used
    }

    pub fn accounting(&self) -> &WorkAccounting {
        &self.accounting
    }

    /// Charge before doing work. Rejection leaves all counters unchanged.
    pub fn consume(&mut self, units: u64) -> bool {
        if self.is_cancelled() {
            return false;
        }
        if units > self.remaining() {
            self.exhausted = true;
            return false;
        }

        self.used += units;
        self.accounting.by_stage[self.stage as usize] += units;
        true
    }

    /// Nested stages attribute each charge once and restore their caller even during unwinding.
    pub fn with_stage<T>(&mut self, stage: WorkStage, operation: impl FnOnce(&mut Self) -> T) -> T {
        let previous = self.stage;
        self.stage = stage;
        let guard = StageGuard {
            budget: self,
            previous,
        };

        operation(&mut *guard.budget)
    }
}

struct StageGuard<'a> {
    budget: &'a mut WorkBudget,
    previous: WorkStage,
}

impl Drop for StageGuard<'_> {
    fn drop(&mut self) {
        self.budget.stage = self.previous;
    }
}
