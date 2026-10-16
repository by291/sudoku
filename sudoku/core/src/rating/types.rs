use std::cell::OnceCell;

use crate::constraints::types::{PreparedComputation, RuleViolation};
use crate::logic::techniques::{ALL_TECHNIQUES, Technique};
use crate::logic::types::LogicalStep;
use crate::rules::types::{PreparedRules, PuzzleRules, SudokuVariant};
use crate::types::{Board, Difficulty};

#[derive(Clone, Copy, Debug)]
pub struct AssessmentLimits {
    pub max_steps: u32,
    pub max_work: u64,
}

#[derive(Clone, Debug)]
pub struct AssessmentInput {
    pub board: Board,
    pub rules: PuzzleRules,
    pub rating_version: String,
    pub limits: AssessmentLimits,
}

pub const RATING_VERSION: &str = "sudoku-rating-v2";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TechniqueCounts(pub(crate) [u64; ALL_TECHNIQUES.len()]);

impl Default for TechniqueCounts {
    fn default() -> Self {
        Self([0; ALL_TECHNIQUES.len()])
    }
}

impl TechniqueCounts {
    pub fn count(&self, technique: Technique) -> u64 {
        self.0[technique as usize]
    }
    pub(crate) fn increment(&mut self, technique: Technique) {
        self.0[technique as usize] += 1;
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReasoningWorkload {
    pub steps: u64,
    pub placements: u64,
    pub eliminations: u64,
    pub candidate_removals: u64,
    pub technique_counts: TechniqueCounts,
    pub highest_tier: Option<Difficulty>,
    pub highest_technique: Option<Technique>,
    pub variant_steps: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DifficultyAssessment {
    pub variant: SudokuVariant,
    pub difficulty: Difficulty,
    pub workload: ReasoningWorkload,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RatedAssessment {
    pub summary: DifficultyAssessment,
    pub trace: Vec<LogicalStep>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AssessmentIssue {
    Message(String),
    Violation(RuleViolation),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AssessmentStage {
    Validation,
    Logic,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ExhaustionCause {
    WorkLimit,
    LogicalStepLimit,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AssessmentFailure {
    Ungraded {
        variant: SudokuVariant,
    },
    BudgetExhausted {
        variant: SudokuVariant,
        stage: AssessmentStage,
        difficulty: Option<Difficulty>,
    },
    Invalid {
        issues: Vec<AssessmentIssue>,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AssessmentResult {
    Rated(Box<RatedAssessment>),
    Unrated(AssessmentFailure),
}

/// Completion consumes a successful trial's board and trace; no budget or policy search is retained.
pub struct RatedTrial {
    pub(crate) board: Board,
    pub(crate) rules: PreparedRules,
    pub(crate) difficulty: Difficulty,
    pub(crate) trace: Vec<LogicalStep>,
}

impl RatedTrial {
    pub fn difficulty(&self) -> Difficulty {
        self.difficulty
    }
}

pub enum TrialAssessmentResult {
    Rated(RatedTrial),
    Unrated(AssessmentFailure),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TargetFeedback {
    pub remaining_cells: usize,
    pub deductions: usize,
}

pub enum TargetScreenResult {
    BelowTarget {
        trial: RatedTrial,
        feedback: TargetFeedback,
    },
    MatchingTarget {
        trial: RatedTrial,
        feedback: TargetFeedback,
    },
    TargetStalled {
        feedback: TargetFeedback,
    },
    BudgetExhausted {
        cause: ExhaustionCause,
    },
    Invalid {
        issues: Vec<AssessmentIssue>,
    },
}

/// Synchronous owner of a lazy immutable layout; no mutable domains survive an evaluation.
pub struct PreparedAssessment {
    pub(crate) rules: PuzzleRules,
    pub(crate) limits: AssessmentLimits,
    pub(crate) computation: OnceCell<PreparedComputation>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AssessmentIdentity {
    pub variant: SudokuVariant,
    pub difficulty: Difficulty,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UnavailableReason {
    Ungraded,
    BudgetExhausted,
    InvalidInput,
    InvalidSummary,
    UnsupportedVersion,
    IdentityMismatch,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PuzzleAssessment {
    Rated(DifficultyAssessment),
    Unavailable {
        reason: UnavailableReason,
        issues: Vec<String>,
    },
}

/// Wire parsers retain shape errors and the version before semantic summary validation.
/// Absence is represented by Option::None and cannot become corrupt metadata.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum StoredAssessment {
    Rated {
        rating_version: String,
        summary: Result<DifficultyAssessment, Vec<String>>,
    },
    Unavailable {
        reason: UnavailableReason,
        issues: Vec<String>,
    },
    OtherOutcome,
    Malformed {
        issues: Vec<String>,
    },
}
