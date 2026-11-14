use std::sync::Arc;

use crate::rules::types::PreparedRules;
use crate::types::{BOARD_SIZE, Bounded, CandidateMask, CoreResult, EngineError, UNIT_SIZE};

pub const MAX_CATALOGUE_CELLS: usize = 4;
pub const MAX_TUPLES_PER_CONSTRAINT: usize = 512;
pub const MAX_TUPLES_PER_LAYOUT: usize = 8192;

#[derive(Clone, Copy, Debug)]
pub struct CatalogueLimits {
    pub max_tuples_per_constraint: usize,
    pub max_tuples_per_layout: usize,
}

impl Default for CatalogueLimits {
    fn default() -> Self {
        Self {
            max_tuples_per_constraint: MAX_TUPLES_PER_CONSTRAINT,
            max_tuples_per_layout: MAX_TUPLES_PER_LAYOUT,
        }
    }
}

impl CatalogueLimits {
    pub(crate) fn validate(self) -> CoreResult<()> {
        if self.max_tuples_per_constraint > MAX_TUPLES_PER_CONSTRAINT
            || self.max_tuples_per_layout > MAX_TUPLES_PER_LAYOUT
        {
            return Err(EngineError::invalid(
                "Catalogue limits may only lower the fixed memory bounds",
            ));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
/// A complete local possibility proof under the supplied domains, not global satisfiability.
pub struct SupportSnapshot {
    pub cells: Vec<usize>,
    pub supports: Vec<CandidateMask>,
}

// Arrow permits a circle plus nine shaft cells; other local constraints use at most nine cells.
pub(crate) const MAX_CONSTRAINT_CELLS: usize = UNIT_SIZE + 1;

/// Query-local masks borrow their geometry from the immutable constraint owner.
#[derive(Clone, Copy)]
pub(crate) struct SupportMasks {
    pub bits: [u16; MAX_CONSTRAINT_CELLS],
    pub len: usize,
}

impl SupportMasks {
    /// Borrow only the masks belonging to positions in this constraint.
    pub fn as_slice(&self) -> &[u16] {
        &self.bits[..self.len]
    }

    /// Pair the masks with the cells of the same constraint in an owned snapshot.
    pub fn into_snapshot(self, cells: &[usize]) -> SupportSnapshot {
        debug_assert_eq!(cells.len(), self.len);
        let masks = self.as_slice();
        let supports = masks
            .iter()
            .map(|&bits| CandidateMask::from_computed_bits(bits))
            .collect();

        SupportSnapshot {
            cells: cells.to_vec(),
            supports,
        }
    }
}

pub(crate) type SupportMasksResult = Bounded<SupportMasks>;

pub type SupportResult = Bounded<SupportSnapshot>;
pub type CandidateResult = Bounded<[CandidateMask; BOARD_SIZE]>;

// Each block indexes up to 64 complete tuples by position and digit.
pub(crate) type CageTupleBlock = [[u64; UNIT_SIZE]; MAX_CATALOGUE_CELLS];

pub(crate) struct CageCatalogue {
    pub arity: usize,
    pub tuples: Vec<[u16; MAX_CATALOGUE_CELLS]>,
    pub index: Vec<CageTupleBlock>,
}

pub(crate) struct SupportLayout {
    pub rules: PreparedRules,
    pub catalogues: Vec<Option<CageCatalogue>>,
}

/// Complete static catalogues are immutable; every query owns its domain-dependent result.
#[derive(Clone)]
pub struct PreparedConstraintSupport {
    pub(crate) layout: Arc<SupportLayout>,
}

/// A layout owns both its validated geometry and support, so they cannot be mixed by callers.
#[derive(Clone)]
pub struct PreparedComputation {
    pub(crate) rules: PreparedRules,
    pub(crate) support: PreparedConstraintSupport,
}

/// Cost policy is separate from rule semantics and catalogue memory limits.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LiveComputationCost {
    Small,
    HeavyEnumeration,
}

impl PreparedComputation {
    /// Classify the layout for the host's live-computation dispatch policy.
    pub fn live_computation_cost(&self) -> LiveComputationCost {
        use crate::rules::types::RuleConstraint;
        const MAX_IMMEDIATE_CAGE_CELLS: usize = 4;

        // Exhaustive dispatch makes a new primitive choose its live-computation policy.
        let context = self.rules.context();
        let is_heavy = context
            .constraints
            .iter()
            .any(|constraint| match constraint {
                RuleConstraint::Cage { cells, .. } => cells.len() > MAX_IMMEDIATE_CAGE_CELLS,
                RuleConstraint::Thermo { .. } | RuleConstraint::Arrow { .. } => false,
            });

        if is_heavy {
            LiveComputationCost::HeavyEnumeration
        } else {
            LiveComputationCost::Small
        }
    }

    /// Borrow the prepared rules that own the support catalogue's geometry.
    pub fn rules(&self) -> &PreparedRules {
        &self.rules
    }

    /// Borrow the immutable support catalogue for this prepared layout.
    pub fn support(&self) -> &PreparedConstraintSupport {
        &self.support
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConflictStatus {
    Complete,
    Incomplete,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ViolationCode {
    Duplicate,
    CageTotal { index: usize, sum: u16 },
    ThermoOrder { index: usize },
    ArrowTotal { index: usize },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RuleViolation {
    pub constraint_id: String,
    pub cells: Vec<usize>,
    pub code: ViolationCode,
}

#[derive(Clone, Debug)]
/// On exhaustion, returned violations are sound but may be incomplete.
pub struct ConflictResult {
    pub status: ConflictStatus,
    pub violations: Vec<RuleViolation>,
}
