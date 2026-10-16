use crate::dto::values::{BoardDto, DifficultyDto, VariantDto};
use sudoku_core::budget::WorkBudget;
use sudoku_core::rules::types::SudokuVariant;
use sudoku_core::types::{Board, CoreResult, Difficulty, EngineError};

pub const DEFAULT_QUERY_WORK: u32 = 1000000;
pub const MAX_BROWSER_WORK: u32 = 4000000;

impl TryFrom<BoardDto> for Board {
    type Error = EngineError;
    fn try_from(value: BoardDto) -> CoreResult<Self> {
        Board::try_from(value.0.as_slice())
    }
}

impl From<&Board> for BoardDto {
    fn from(value: &Board) -> Self {
        Self(value.values().to_vec())
    }
}

impl From<DifficultyDto> for Difficulty {
    fn from(value: DifficultyDto) -> Self {
        match value {
            DifficultyDto::Easy => Self::Easy,
            DifficultyDto::Medium => Self::Medium,
            DifficultyDto::Hard => Self::Hard,
            DifficultyDto::Expert => Self::Expert,
        }
    }
}

impl From<Difficulty> for DifficultyDto {
    fn from(value: Difficulty) -> Self {
        match value {
            Difficulty::Easy => Self::Easy,
            Difficulty::Medium => Self::Medium,
            Difficulty::Hard => Self::Hard,
            Difficulty::Expert => Self::Expert,
        }
    }
}

impl From<VariantDto> for SudokuVariant {
    fn from(value: VariantDto) -> Self {
        match value {
            VariantDto::Classic => Self::Classic,
            VariantDto::Diagonal => Self::Diagonal,
            VariantDto::Jigsaw => Self::Jigsaw,
            VariantDto::Killer => Self::Killer,
            VariantDto::Thermo => Self::Thermo,
            VariantDto::Arrow => Self::Arrow,
        }
    }
}

impl From<SudokuVariant> for VariantDto {
    fn from(value: SudokuVariant) -> Self {
        match value {
            SudokuVariant::Classic => Self::Classic,
            SudokuVariant::Diagonal => Self::Diagonal,
            SudokuVariant::Jigsaw => Self::Jigsaw,
            SudokuVariant::Killer => Self::Killer,
            SudokuVariant::Thermo => Self::Thermo,
            SudokuVariant::Arrow => Self::Arrow,
        }
    }
}

pub fn counter(value: u64) -> CoreResult<u32> {
    u32::try_from(value)
        .map_err(|_| EngineError::invalid("Core counter exceeds the browser's numeric bounds"))
}

pub fn index(value: usize) -> CoreResult<u32> {
    u32::try_from(value)
        .map_err(|_| EngineError::invalid("Core index exceeds the browser's numeric bounds"))
}

pub fn indices(values: impl AsRef<[usize]>) -> CoreResult<Vec<u32>> {
    values.as_ref().iter().copied().map(index).collect()
}

pub fn core_indices(values: Vec<u32>) -> CoreResult<Vec<usize>> {
    values
        .into_iter()
        .map(|value| {
            usize::try_from(value)
                .map_err(|_| EngineError::invalid("Cell index exceeds platform bounds"))
        })
        .collect()
}

pub fn budget(
    max_work: Option<u32>,
    initial_work: Option<u32>,
    default_work: u32,
) -> CoreResult<WorkBudget> {
    let limit = max_work.unwrap_or(default_work);
    if limit > MAX_BROWSER_WORK {
        return Err(EngineError::invalid(
            "Browser work limits may only lower the fixed bounds",
        ));
    }
    let mut budget = WorkBudget::new(u64::from(limit));
    if !budget.consume(u64::from(initial_work.unwrap_or(0))) {
        return Err(EngineError::invalid(
            "Initial work exceeds the supplied budget",
        ));
    }
    Ok(budget)
}
