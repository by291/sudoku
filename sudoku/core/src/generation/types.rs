use crate::puzzle::Puzzle;
use crate::random::Seed;
use crate::rating::types::DifficultyAssessment;
use crate::rules::types::{PuzzleRules, SudokuVariant};
use crate::types::{Board, CoreResult, Difficulty, EngineError};

pub const PUZZLE_VERSION: &str = "sudoku-v12";
pub const VARIANT_PUZZLE_VERSION: &str = "sudoku-variants-v12";
const MAX_LAYOUT_ATTEMPTS: u32 = 40;
const MAX_LOGICAL_STEPS: u32 = 500;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GenerationVersion {
    ClassicV12,
    VariantsV12,
}

impl GenerationVersion {
    /// Return the persisted identifier for this generation version.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ClassicV12 => PUZZLE_VERSION,
            Self::VariantsV12 => VARIANT_PUZZLE_VERSION,
        }
    }

    /// Parse a generation version supported by this engine.
    pub fn parse(value: &str) -> CoreResult<Self> {
        match value {
            PUZZLE_VERSION => Ok(Self::ClassicV12),
            VARIANT_PUZZLE_VERSION => Ok(Self::VariantsV12),
            _ => Err(EngineError::invalid(
                "Unsupported generation version for this type",
            )),
        }
    }

    pub(crate) fn for_variant(variant: SudokuVariant) -> Self {
        if variant == SudokuVariant::Classic {
            Self::ClassicV12
        } else {
            Self::VariantsV12
        }
    }
}

/// Byte-owned current-version identity; constructors reject unsupported variant/tier/version pairs.
#[derive(Clone, Debug)]
pub struct GenerationInput {
    pub(crate) variant: SudokuVariant,
    pub(crate) difficulty: Difficulty,
    pub(crate) seed: Seed,
    pub(crate) puzzle_version: GenerationVersion,
}

impl GenerationInput {
    /// Construct an identity using the current version for this variant.
    pub fn new(variant: SudokuVariant, difficulty: Difficulty, seed: Seed) -> CoreResult<Self> {
        Self::from_version(
            variant,
            difficulty,
            seed,
            GenerationVersion::for_variant(variant).as_str(),
        )
    }

    /// Validate the requested difficulty and version before constructing an identity.
    pub fn from_version(
        variant: SudokuVariant,
        difficulty: Difficulty,
        seed: Seed,
        version: &str,
    ) -> CoreResult<Self> {
        if !crate::rating::policies::supports_difficulty(variant, difficulty) {
            return Err(EngineError::invalid(
                "Expert is available only for Classic. Choose Classic or Easy, Medium, or Hard.",
            ));
        }

        let puzzle_version = GenerationVersion::parse(version)?;
        if puzzle_version != GenerationVersion::for_variant(variant) {
            return Err(EngineError::invalid(
                "Unsupported generation version for this type",
            ));
        }

        Ok(Self {
            variant,
            difficulty,
            seed,
            puzzle_version,
        })
    }

    /// Return the rule variant in this identity.
    pub fn variant(&self) -> SudokuVariant {
        self.variant
    }

    /// Return the target tier in this identity.
    pub fn difficulty(&self) -> Difficulty {
        self.difficulty
    }

    /// Borrow the seed bytes through their fixed-width value.
    pub fn seed(&self) -> &Seed {
        &self.seed
    }

    /// Return the version that owns this identity.
    pub fn puzzle_version(&self) -> GenerationVersion {
        self.puzzle_version
    }
}

#[derive(Clone, Copy, Debug)]
pub struct GenerationLimits {
    /// Maximum number of layout attempts, including attempts without valid geometry.
    pub max_layouts: u32,
    /// Maximum logical deductions per assessment.
    pub max_steps: u32,
}

impl Default for GenerationLimits {
    fn default() -> Self {
        Self {
            max_layouts: MAX_LAYOUT_ATTEMPTS,
            max_steps: MAX_LOGICAL_STEPS,
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct GenerationMetrics {
    /// Layout attempts started, including those that did not yield a usable layout.
    pub layouts: u32,
    /// Layouts prepared with an initial clue frontier.
    pub completed_layouts: u32,
    /// Scheduled clue proposals evaluated across all layouts.
    pub candidate_visits: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GenerationExhaustionCause {
    Cancelled,
    LogicalStepLimit,
    LayoutLimit,
    ExhaustedFrontier,
}

#[derive(Clone, Debug)]
pub struct GeneratedPuzzle {
    pub content: Puzzle,
    pub seed: Seed,
    pub puzzle_version: GenerationVersion,
}

#[derive(Clone, Debug)]
pub enum GenerationOutcome {
    Ready {
        puzzle: Box<GeneratedPuzzle>,
        assessment: Box<DifficultyAssessment>,
    },
    Incomplete {
        cause: GenerationExhaustionCause,
    },
    Failed {
        reason: String,
    },
}

#[derive(Clone, Debug)]
pub struct GenerationResult {
    pub outcome: GenerationOutcome,
    pub metrics: GenerationMetrics,
}

pub enum LayoutConstructionResult {
    Ready { terminal: Board, rules: PuzzleRules },
    Incomplete,
    AttemptExhausted,
    Failed { reason: String },
}
