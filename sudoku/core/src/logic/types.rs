use super::techniques::Technique;
use crate::constraints::types::PreparedConstraintSupport;
use crate::rules::types::{PreparedRules, Unit};
use crate::types::{BOARD_SIZE, Board, Bounded, CandidateMask};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CandidateDomain {
    pub cell: usize,
    pub mask: CandidateMask,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CellBound {
    pub cell: usize,
    pub min: u8,
    pub max: u8,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RuleEvidenceKind {
    Cage {
        sum: u16,
        domains: Vec<CandidateDomain>,
    },
    Thermo {
        path: Vec<usize>,
        bounds: Vec<CellBound>,
    },
    Arrow {
        circle: usize,
        shaft: Vec<usize>,
        domains: Vec<CandidateDomain>,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RuleEvidence {
    pub constraint_id: String,
    pub cells: Vec<usize>,
    pub digits: Vec<u8>,
    pub kind: RuleEvidenceKind,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ColoringMode {
    Trap,
    Wrap,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ColoringLink {
    pub unit: Unit,
    pub cells: [usize; 2],
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AdvancedEvidenceKind {
    Subset {
        unit: Unit,
        hidden: bool,
    },
    Fish {
        bases: Vec<Unit>,
        covers: Vec<Unit>,
    },
    Wing {
        pivot: usize,
        wings: [usize; 2],
    },
    Coloring {
        mode: ColoringMode,
        colors: [Vec<usize>; 2],
        links: Vec<ColoringLink>,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AdvancedEvidence {
    pub cells: Vec<usize>,
    pub digits: Vec<u8>,
    pub domains: Vec<CandidateDomain>,
    pub kind: AdvancedEvidenceKind,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Evidence {
    Rule(RuleEvidence),
    Advanced(AdvancedEvidence),
    Unit {
        unit: Unit,
        cells: Vec<usize>,
        digits: Vec<u8>,
        premises: Vec<RuleEvidence>,
        units: Option<Vec<Unit>>,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Removal {
    pub cell: usize,
    pub digit: u8,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LogicalAction {
    Placement { cell: usize, digit: u8 },
    Elimination { removals: Vec<Removal> },
}

/// Owns every nested witness array independently of prepared layouts and workspaces.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LogicalStep {
    pub technique: Technique,
    pub evidence: Evidence,
    pub action: LogicalAction,
}

pub type StepOutcome = Bounded<Option<Box<LogicalStep>>>;

pub(crate) struct CageMemo {
    pub domains: [CandidateMask; crate::constraints::types::MAX_CONSTRAINT_CELLS],
    pub supports: crate::constraints::types::SupportMasks,
}

/// Fresh mutable board state; only immutable preparation may be shared between trial boards.
pub struct LogicalWorkspace {
    pub board: Board,
    pub candidates: [CandidateMask; BOARD_SIZE],
    pub(crate) rules: PreparedRules,
    pub(crate) premises: Vec<RuleEvidence>,
    pub(crate) support: Option<PreparedConstraintSupport>,
    pub(crate) cage_memo: Vec<Option<CageMemo>>,
}

impl LogicalWorkspace {
    pub fn rules(&self) -> &PreparedRules {
        &self.rules
    }
    pub fn premises(&self) -> &[RuleEvidence] {
        &self.premises
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LogicStatus {
    Solved,
    Stalled,
    WorkLimit,
    StepLimit,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LogicResult {
    pub board: Board,
    pub steps: Vec<LogicalStep>,
    pub status: LogicStatus,
}
