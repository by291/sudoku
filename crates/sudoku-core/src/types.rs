use std::fmt;

pub const BOARD_SIZE: usize = 81;
pub const UNIT_SIZE: usize = 9;
pub const BOX_SIZE: usize = 3;
/// Bits 0 through 8 denote digits 1 through 9; bit zero never denotes an empty cell.
pub const ALL_DIGITS_MASK: u16 = (1 << UNIT_SIZE) - 1;

pub type CoreResult<T> = Result<T, EngineError>;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EngineError {
    InvalidBoardLength(usize),
    InvalidDigit(u8),
    InvalidCellIndex(usize),
    InvalidCandidateMask(u16),
    InvalidSeedLength(usize),
    InvalidInput(Vec<String>),
}

impl EngineError {
    pub fn invalid(message: impl Into<String>) -> Self {
        Self::InvalidInput(vec![message.into()])
    }
}

impl fmt::Display for EngineError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidBoardLength(length) => {
                write!(formatter, "A board requires 81 cells, received {length}")
            }
            Self::InvalidDigit(digit) => write!(formatter, "Invalid Sudoku digit: {digit}"),
            Self::InvalidCellIndex(cell) => write!(formatter, "Invalid cell index: {cell}"),
            Self::InvalidCandidateMask(mask) => {
                write!(formatter, "Invalid nine-digit mask: {mask}")
            }
            Self::InvalidSeedLength(length) => {
                write!(formatter, "A seed requires 32 bytes, received {length}")
            }
            Self::InvalidInput(issues) => formatter.write_str(&issues.join("; ")),
        }
    }
}

impl std::error::Error for EngineError {}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Bounded<T> {
    Complete(T),
    BudgetExhausted,
}

/// Owns validated values in the range 0..=9, where zero denotes an empty cell.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Board([u8; BOARD_SIZE]);

impl Board {
    pub const EMPTY: Self = Self([0; BOARD_SIZE]);

    // Computed boards contain only existing validated values or digits selected from nine-bit domains.
    pub(crate) fn from_computed_values(values: [u8; BOARD_SIZE]) -> Self {
        assert!(
            values.iter().all(|&value| usize::from(value) <= UNIT_SIZE),
            "Computed board values must remain valid Sudoku values"
        );
        Self(values)
    }

    pub fn values(&self) -> &[u8; BOARD_SIZE] {
        &self.0
    }
}

impl TryFrom<&[u8]> for Board {
    type Error = EngineError;

    fn try_from(values: &[u8]) -> CoreResult<Self> {
        let cells: [u8; BOARD_SIZE] = values
            .try_into()
            .map_err(|_| EngineError::InvalidBoardLength(values.len()))?;
        if let Some(digit) = cells.iter().find(|digit| **digit > UNIT_SIZE as u8) {
            return Err(EngineError::InvalidDigit(*digit));
        }

        Ok(Self(cells))
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Digit(u8);

impl Digit {
    pub fn value(self) -> u8 {
        self.0
    }
}

impl TryFrom<u8> for Digit {
    type Error = EngineError;

    fn try_from(value: u8) -> CoreResult<Self> {
        if !(1..=UNIT_SIZE as u8).contains(&value) {
            return Err(EngineError::InvalidDigit(value));
        }

        Ok(Self(value))
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct CellIndex(usize);

impl CellIndex {
    pub fn value(self) -> usize {
        self.0
    }
}

impl TryFrom<usize> for CellIndex {
    type Error = EngineError;

    fn try_from(value: usize) -> CoreResult<Self> {
        if value >= BOARD_SIZE {
            return Err(EngineError::InvalidCellIndex(value));
        }

        Ok(Self(value))
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct CandidateMask(u16);

impl CandidateMask {
    // Internal unions/intersections preserve nine-bit validity; external bits must use TryFrom.
    pub(crate) fn from_computed_bits(bits: u16) -> Self {
        debug_assert_eq!(bits & !ALL_DIGITS_MASK, 0);
        Self(bits)
    }

    pub const EMPTY: Self = Self(0);
    pub const ALL: Self = Self(ALL_DIGITS_MASK);

    // Only validated Board values reach this internal operation; zero removes no digit.
    pub(crate) fn exclude_board_value(&mut self, value: u8) {
        if value != 0 {
            self.0 &= !(1 << (value - 1));
        }
    }

    pub fn bits(self) -> u16 {
        self.0
    }
}

impl TryFrom<u16> for CandidateMask {
    type Error = EngineError;

    fn try_from(bits: u16) -> CoreResult<Self> {
        if bits & !ALL_DIGITS_MASK != 0 {
            return Err(EngineError::InvalidCandidateMask(bits));
        }

        Ok(Self(bits))
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Difficulty {
    Easy,
    Medium,
    Hard,
    Expert,
}

impl Difficulty {
    pub const ALL: [Self; 4] = [Self::Easy, Self::Medium, Self::Hard, Self::Expert];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Easy => "easy",
            Self::Medium => "medium",
            Self::Hard => "hard",
            Self::Expert => "expert",
        }
    }
}
