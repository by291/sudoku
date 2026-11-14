use std::sync::Arc;

use crate::types::BOARD_SIZE;

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
    /// Return the canonical identifier used across engine boundaries.
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
    /// Identify the variant independently of its clue geometry.
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
    /// Return the canonical unit label used in rule and evidence identifiers.
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
    /// Borrow clue cells in rule order, with the circle first for an Arrow.
    pub fn cells(&self) -> &[usize] {
        match self {
            Self::Cage { cells, .. } | Self::Thermo { cells, .. } | Self::Arrow { cells, .. } => {
                cells
            }
        }
    }

    /// Borrow the layout-local identifier used in violation and deduction evidence.
    pub fn id(&self) -> &str {
        match self {
            Self::Cage { id, .. } | Self::Thermo { id, .. } | Self::Arrow { id, .. } => id,
        }
    }

    /// Return the zero-based position of this clue in its variant definition.
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
    layout: Arc<PreparedLayout>,
}

#[derive(Debug)]
struct PreparedLayout {
    metadata: RuleMetadata,
    unit_masks: Vec<u128>,
    single_cells: Vec<(usize, usize)>,
    duplicate_groups: Vec<Vec<usize>>,
}

impl PreparedRules {
    /// Index full units and preserve their first occurrence of each cell for logical evidence.
    pub(crate) fn new(metadata: RuleMetadata, duplicate_groups: Vec<Vec<usize>>) -> Self {
        let unit_masks = metadata
            .units
            .iter()
            .map(|unit| {
                unit.cells
                    .iter()
                    .fold(0, |mask, &cell| mask | (1_u128 << cell))
            })
            .collect();

        // Naked Single uses the first unit containing a cell to keep its evidence stable.
        let mut visited = 0_u128;
        let mut single_cells = Vec::with_capacity(BOARD_SIZE);
        for (index, unit) in metadata.units.iter().enumerate() {
            for &cell in &unit.cells {
                let bit = 1_u128 << cell;
                if visited & bit == 0 {
                    single_cells.push((cell, index));
                    visited |= bit;
                }
            }
        }

        Self {
            layout: Arc::new(PreparedLayout {
                metadata,
                unit_masks,
                single_cells,
                duplicate_groups,
            }),
        }
    }

    /// Borrow each cell paired with its first unit in evidence order.
    pub(crate) fn single_cells(&self) -> &[(usize, usize)] {
        &self.layout.single_cells
    }

    /// Borrow the cell masks in the same order as the complete units.
    pub(crate) fn unit_masks(&self) -> &[u128] {
        &self.layout.unit_masks
    }

    /// Borrow the groups whose members must have distinct digits.
    pub(crate) fn duplicate_groups(&self) -> &[Vec<usize>] {
        &self.layout.duplicate_groups
    }

    /// Borrow the layout metadata used by core computations.
    pub(crate) fn context(&self) -> &RuleMetadata {
        &self.layout.metadata
    }

    /// Borrow immutable layout metadata without allocating an intermediate snapshot.
    pub fn metadata_ref(&self) -> &RuleMetadata {
        &self.layout.metadata
    }

    /// Return an owned display snapshot; caller mutations cannot alter later computation.
    pub fn metadata(&self) -> RuleMetadata {
        self.layout.metadata.clone()
    }

    /// Borrow the validated rules from which this layout was compiled.
    pub fn rules(&self) -> &PuzzleRules {
        &self.layout.metadata.rules
    }

    /// Test shared prepared-instance identity, not structural rule equality.
    /// Clones share an instance; independently compiled equal rules do not.
    pub fn same_layout(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.layout, &other.layout)
    }
}

pub(crate) struct CompiledVariantRules {
    pub units: Vec<SudokuUnit>,
    pub constraints: Vec<RuleConstraint>,
    pub duplicate_groups: Vec<Vec<usize>>,
}
