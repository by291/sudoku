use super::values::BoardDto;
use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields)]
pub struct CageDto {
    pub cells: Vec<u32>,
    pub sum: u16,
}

#[derive(Clone, Serialize, Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields)]
pub struct ArrowDto {
    pub circle: u32,
    pub shaft: Vec<u32>,
}

#[derive(Clone, Serialize, Deserialize, uniffi::Enum)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum RulesDto {
    Classic,
    Diagonal,
    Jigsaw { regions: Vec<Vec<u32>> },
    Killer { cages: Vec<CageDto> },
    Thermo { paths: Vec<Vec<u32>> },
    Arrow { arrows: Vec<ArrowDto> },
}

#[derive(Clone, Copy, Serialize, Deserialize, uniffi::Enum)]
#[serde(rename_all = "lowercase")]
pub enum UnitKindDto {
    Row,
    Column,
    Box,
    Region,
    Diagonal,
}

#[derive(Clone, Serialize, Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields)]
pub struct UnitDto {
    pub kind: UnitKindDto,
    pub index: u32,
}

#[derive(Serialize, uniffi::Record)]
pub struct SudokuUnitDto {
    pub kind: UnitKindDto,
    pub index: u32,
    pub cells: Vec<u32>,
}

#[derive(Serialize, uniffi::Enum)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum ConstraintDto {
    Cage {
        id: String,
        index: u32,
        cells: Vec<u32>,
        sum: u16,
    },
    Thermo {
        id: String,
        index: u32,
        cells: Vec<u32>,
    },
    Arrow {
        id: String,
        index: u32,
        circle: u32,
        shaft: Vec<u32>,
    },
}

#[derive(Serialize, uniffi::Record)]
#[serde(rename_all = "camelCase")]
pub struct MetadataDto {
    pub rules: RulesDto,
    pub units: Vec<SudokuUnitDto>,
    pub constraints: Vec<ConstraintDto>,
    pub cell_units: Vec<Vec<u32>>,
    pub cell_constraints: Vec<Vec<u32>>,
    pub duplicate_peers: Vec<Vec<u32>>,
    pub related_cells: Vec<Vec<u32>>,
}

#[derive(Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct PrepareInputDto {
    pub rules: RulesDto,
    #[serde(default)]
    pub max_work: Option<u32>,
}

#[derive(Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct TransformInputDto {
    pub rules: RulesDto,
    pub symmetry: u8,
    #[serde(default)]
    pub complement: bool,
}

#[derive(Serialize, Deserialize, uniffi::Record)]
#[serde(deny_unknown_fields)]
pub struct PuzzleContentDto {
    pub givens: BoardDto,
    pub solution: BoardDto,
    pub rules: RulesDto,
    pub difficulty: super::values::DifficultyDto,
}

#[derive(Serialize, uniffi::Enum)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum ValidationDto {
    Valid,
    Invalid { issues: Vec<String> },
    BudgetExhausted,
}
