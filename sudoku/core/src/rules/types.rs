use std::sync::Arc;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SudokuVariant {
    Classic,
    Diagonal,
    Jigsaw,
    Killer,
    Thermo,
    Arrow,
}

impl SudokuVariant {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Classic => "classic",
            Self::Diagonal => "diagonal",
            Self::Jigsaw => "jigsaw",
            Self::Killer => "killer",
            Self::Thermo => "thermo",
            Self::Arrow => "arrow",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Cage {
    pub cells: Vec<usize>,
    pub sum: u16,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Arrow {
    pub circle: usize,
    pub shaft: Vec<usize>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PuzzleRules {
    Classic,
    Diagonal,
    Jigsaw { regions: Vec<Vec<usize>> },
    Killer { cages: Vec<Cage> },
    Thermo { paths: Vec<Vec<usize>> },
    Arrow { arrows: Vec<Arrow> },
}

impl PuzzleRules {
    pub fn variant(&self) -> SudokuVariant {
        match self {
            Self::Classic => SudokuVariant::Classic,
            Self::Diagonal => SudokuVariant::Diagonal,
            Self::Jigsaw { .. } => SudokuVariant::Jigsaw,
            Self::Killer { .. } => SudokuVariant::Killer,
            Self::Thermo { .. } => SudokuVariant::Thermo,
            Self::Arrow { .. } => SudokuVariant::Arrow,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UnitKind {
    Row,
    Column,
    Box,
    Region,
    Diagonal,
}

impl UnitKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Row => "row",
            Self::Column => "column",
            Self::Box => "box",
            Self::Region => "region",
            Self::Diagonal => "diagonal",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Unit {
    pub kind: UnitKind,
    pub index: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SudokuUnit {
    pub kind: UnitKind,
    pub index: usize,
    pub cells: Vec<usize>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RuleConstraint {
    Cage {
        id: String,
        index: usize,
        cells: Vec<usize>,
        sum: u16,
    },
    Thermo {
        id: String,
        index: usize,
        cells: Vec<usize>,
    },
    // The first owned cell is the circle, followed by the shaft in path order.
    Arrow {
        id: String,
        index: usize,
        cells: Vec<usize>,
    },
}

impl RuleConstraint {
    pub fn cells(&self) -> &[usize] {
        match self {
            Self::Cage { cells, .. } | Self::Thermo { cells, .. } | Self::Arrow { cells, .. } => {
                cells
            }
        }
    }

    pub fn id(&self) -> &str {
        match self {
            Self::Cage { id, .. } | Self::Thermo { id, .. } | Self::Arrow { id, .. } => id,
        }
    }

    pub fn index(&self) -> usize {
        match self {
            Self::Cage { index, .. } | Self::Thermo { index, .. } | Self::Arrow { index, .. } => {
                *index
            }
        }
    }
}

/// Complete nine-digit units, duplicate peers and related highlights are different relations.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RuleMetadata {
    pub rules: PuzzleRules,
    pub units: Vec<SudokuUnit>,
    pub constraints: Vec<RuleConstraint>,
    pub cell_units: Vec<Vec<usize>>,
    pub cell_constraints: Vec<Vec<usize>>,
    pub duplicate_peers: Vec<Vec<usize>>,
    pub related_cells: Vec<Vec<usize>>,
}

/// Immutable compiled layout, shared without sharing board domains or returned evidence.
#[derive(Clone, Debug)]
pub struct PreparedRules {
    data: Arc<RuleMetadata>,
}

impl PreparedRules {
    pub(crate) fn new(data: RuleMetadata) -> Self {
        Self {
            data: Arc::new(data),
        }
    }

    pub(crate) fn context(&self) -> &RuleMetadata {
        &self.data
    }

    /// Borrow immutable layout metadata without allocating an intermediate snapshot.
    pub fn metadata_ref(&self) -> &RuleMetadata {
        &self.data
    }

    /// Return an owned display snapshot; caller mutations cannot alter later computation.
    pub fn metadata(&self) -> RuleMetadata {
        (*self.data).clone()
    }

    pub fn rules(&self) -> &PuzzleRules {
        &self.data.rules
    }

    pub fn same_layout(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.data, &other.data)
    }
}

pub(crate) struct CompiledVariantRules {
    pub units: Vec<SudokuUnit>,
    pub constraints: Vec<RuleConstraint>,
    pub duplicate_groups: Vec<Vec<usize>>,
}
