use super::values::{core_indices, index, indices};
use crate::dto::rules::{
    ArrowDto, CageDto, ConstraintDto, MetadataDto, PuzzleContentDto, RulesDto, SudokuUnitDto,
    UnitDto, UnitKindDto,
};
use sudoku_core::puzzle::Puzzle;
use sudoku_core::rules::context::validate_rules;
use sudoku_core::rules::types::{
    Arrow, Cage, PreparedRules, PuzzleRules, RuleConstraint, Unit, UnitKind,
};
use sudoku_core::types::{CoreResult, EngineError};

impl TryFrom<RulesDto> for PuzzleRules {
    type Error = EngineError;
    fn try_from(value: RulesDto) -> CoreResult<Self> {
        let rules = match value {
            RulesDto::Classic => Self::Classic,
            RulesDto::Diagonal => Self::Diagonal,
            RulesDto::Jigsaw { regions } => Self::Jigsaw {
                regions: regions
                    .into_iter()
                    .map(core_indices)
                    .collect::<CoreResult<_>>()?,
            },
            RulesDto::Killer { cages } => Self::Killer {
                cages: cages
                    .into_iter()
                    .map(|cage| {
                        Ok(Cage {
                            cells: core_indices(cage.cells)?,
                            sum: cage.sum,
                        })
                    })
                    .collect::<CoreResult<_>>()?,
            },
            RulesDto::Thermo { paths } => Self::Thermo {
                paths: paths
                    .into_iter()
                    .map(core_indices)
                    .collect::<CoreResult<_>>()?,
            },
            RulesDto::Arrow { arrows } => Self::Arrow {
                arrows: arrows
                    .into_iter()
                    .map(|arrow| {
                        Ok(Arrow {
                            circle: usize::try_from(arrow.circle).map_err(|_| {
                                EngineError::invalid("Arrow circle exceeds platform bounds")
                            })?,
                            shaft: core_indices(arrow.shaft)?,
                        })
                    })
                    .collect::<CoreResult<_>>()?,
            },
        };
        validate_rules(&rules)?;
        Ok(rules)
    }
}

/// Copy native rule geometry to the corresponding browser variant.
pub fn rules_to_dto(value: &PuzzleRules) -> CoreResult<RulesDto> {
    Ok(match value {
        PuzzleRules::Classic => RulesDto::Classic,
        PuzzleRules::Diagonal => RulesDto::Diagonal,
        PuzzleRules::Jigsaw { regions } => RulesDto::Jigsaw {
            regions: regions.iter().map(indices).collect::<CoreResult<_>>()?,
        },
        PuzzleRules::Killer { cages } => RulesDto::Killer {
            cages: cages
                .iter()
                .map(|cage| {
                    Ok(CageDto {
                        cells: indices(&cage.cells)?,
                        sum: cage.sum,
                    })
                })
                .collect::<CoreResult<_>>()?,
        },
        PuzzleRules::Thermo { paths } => RulesDto::Thermo {
            paths: paths.iter().map(indices).collect::<CoreResult<_>>()?,
        },
        PuzzleRules::Arrow { arrows } => RulesDto::Arrow {
            arrows: arrows
                .iter()
                .map(|arrow| {
                    Ok(ArrowDto {
                        circle: index(arrow.circle)?,
                        shaft: indices(&arrow.shaft)?,
                    })
                })
                .collect::<CoreResult<_>>()?,
        },
    })
}

impl From<UnitKindDto> for UnitKind {
    fn from(value: UnitKindDto) -> Self {
        match value {
            UnitKindDto::Row => Self::Row,
            UnitKindDto::Column => Self::Column,
            UnitKindDto::Box => Self::Box,
            UnitKindDto::Region => Self::Region,
            UnitKindDto::Diagonal => Self::Diagonal,
        }
    }
}

impl From<UnitKind> for UnitKindDto {
    fn from(value: UnitKind) -> Self {
        match value {
            UnitKind::Row => Self::Row,
            UnitKind::Column => Self::Column,
            UnitKind::Box => Self::Box,
            UnitKind::Region => Self::Region,
            UnitKind::Diagonal => Self::Diagonal,
        }
    }
}

/// Convert an ordered unit identity to the browser index width.
pub fn unit_to_dto(unit: Unit) -> CoreResult<UnitDto> {
    Ok(UnitDto {
        kind: unit.kind.into(),
        index: index(unit.index)?,
    })
}

/// Decode a browser unit identity before rule-context validation.
pub fn unit_to_core(unit: UnitDto) -> CoreResult<Unit> {
    let kind: UnitKind = unit.kind.into();
    let maximum = match kind {
        UnitKind::Diagonal => 1,
        _ => sudoku_core::types::UNIT_SIZE as u32 - 1,
    };
    if unit.index > maximum {
        return Err(EngineError::invalid("Invalid Sudoku unit index"));
    }
    Ok(Unit {
        kind,
        index: usize::try_from(unit.index)
            .map_err(|_| EngineError::invalid("Unit index exceeds platform bounds"))?,
    })
}

fn constraint_to_dto(constraint: &RuleConstraint) -> CoreResult<ConstraintDto> {
    Ok(match constraint {
        RuleConstraint::Cage {
            id,
            index: clue_index,
            cells,
            sum,
        } => ConstraintDto::Cage {
            id: id.clone(),
            index: index(*clue_index)?,
            cells: indices(cells)?,
            sum: *sum,
        },
        RuleConstraint::Thermo {
            id,
            index: clue_index,
            cells,
        } => ConstraintDto::Thermo {
            id: id.clone(),
            index: index(*clue_index)?,
            cells: indices(cells)?,
        },
        RuleConstraint::Arrow {
            id,
            index: clue_index,
            cells,
        } => {
            let Some((&circle, shaft)) = cells.split_first() else {
                return Err(EngineError::invalid("Compiled arrow has no circle"));
            };

            ConstraintDto::Arrow {
                id: id.clone(),
                index: index(*clue_index)?,
                circle: index(circle)?,
                shaft: indices(shaft)?,
            }
        }
    })
}

fn index_rows_to_dto(rows: &[Vec<usize>]) -> CoreResult<Vec<Vec<u32>>> {
    rows.iter().map(indices).collect()
}

/// Copy immutable prepared rule metadata into an independent result.
pub fn metadata_to_dto(prepared: &PreparedRules) -> CoreResult<MetadataDto> {
    let metadata = prepared.metadata_ref();
    let units = metadata
        .units
        .iter()
        .map(|unit| {
            Ok(SudokuUnitDto {
                kind: unit.kind.into(),
                index: index(unit.index)?,
                cells: indices(&unit.cells)?,
            })
        })
        .collect::<CoreResult<_>>()?;

    let constraints = metadata
        .constraints
        .iter()
        .map(constraint_to_dto)
        .collect::<CoreResult<_>>()?;

    Ok(MetadataDto {
        rules: rules_to_dto(&metadata.rules)?,
        units,
        constraints,
        cell_units: index_rows_to_dto(&metadata.cell_units)?,
        cell_constraints: index_rows_to_dto(&metadata.cell_constraints)?,
        duplicate_peers: index_rows_to_dto(&metadata.duplicate_peers)?,
        related_cells: index_rows_to_dto(&metadata.related_cells)?,
    })
}

impl TryFrom<PuzzleContentDto> for Puzzle {
    type Error = EngineError;
    fn try_from(value: PuzzleContentDto) -> CoreResult<Self> {
        Ok(Self {
            givens: value.givens.try_into()?,
            solution: value.solution.try_into()?,
            rules: value.rules.try_into()?,
            difficulty: value.difficulty.into(),
        })
    }
}
