use super::variant_strategies::capabilities;
use crate::rules::context::validate_rules;
use crate::rules::types::{Arrow, Cage, PuzzleRules};
use crate::types::{BOARD_SIZE, Board, CoreResult, EngineError, UNIT_SIZE};

const QUARTER_TURNS: u8 = 4;
pub(super) const SPATIAL_SYMMETRY_COUNT: u8 = QUARTER_TURNS * 2;
const LAST_UNIT_INDEX: usize = UNIT_SIZE - 1;
const DIGIT_COMPLEMENT_BASE: u8 = UNIT_SIZE as u8 + 1;

#[derive(Clone, Copy, Debug)]
pub struct SpatialSymmetry(u8);

impl TryFrom<u8> for SpatialSymmetry {
    type Error = EngineError;

    fn try_from(value: u8) -> CoreResult<Self> {
        if value < SPATIAL_SYMMETRY_COUNT {
            Ok(Self(value))
        } else {
            Err(EngineError::invalid("Spatial symmetry must be in 0..=7"))
        }
    }
}

impl SpatialSymmetry {
    pub(crate) fn from_draw(value: usize) -> Self {
        debug_assert!(value < usize::from(SPATIAL_SYMMETRY_COUNT));
        Self(value as u8)
    }

    /// Map each original cell to its reflected and rotated destination.
    pub fn cell_map(self) -> [usize; BOARD_SIZE] {
        std::array::from_fn(|cell| {
            let mut row = cell / UNIT_SIZE;
            let mut column = cell % UNIT_SIZE;
            if self.0 >= QUARTER_TURNS {
                column = LAST_UNIT_INDEX - column;
            }
            for _ in 0..self.0 % QUARTER_TURNS {
                (row, column) = (column, LAST_UNIT_INDEX - row);
            }
            row * UNIT_SIZE + column
        })
    }
}

#[derive(Clone, Copy)]
pub(super) enum DigitTransform {
    Preserve,
    Complement,
}

fn map_cells(cells: &[usize], mapping: &[usize; BOARD_SIZE]) -> Vec<usize> {
    cells.iter().map(|&cell| mapping[cell]).collect()
}

/// Transform validated clue geometry only with permitted rule-preserving symmetries/complements.
pub fn transform_rules(
    rules: &PuzzleRules,
    symmetry: SpatialSymmetry,
    complement: bool,
) -> CoreResult<PuzzleRules> {
    let digit_transform = if complement {
        DigitTransform::Complement
    } else {
        DigitTransform::Preserve
    };
    transform_layout_rules(rules, symmetry, digit_transform)
}

/// Apply an explicit digit transformation to the layout geometry.
pub(super) fn transform_layout_rules(
    rules: &PuzzleRules,
    symmetry: SpatialSymmetry,
    digit_transform: DigitTransform,
) -> CoreResult<PuzzleRules> {
    validate_rules(rules)?;
    if matches!(rules, PuzzleRules::Classic) {
        return Err(EngineError::invalid(
            "Classic uses its own terminal construction",
        ));
    }
    let should_complement = matches!(digit_transform, DigitTransform::Complement);
    if should_complement && !capabilities(rules.variant()).allows_complement {
        return Err(EngineError::invalid(
            "Complement does not preserve arrow sums",
        ));
    }

    let mapping = symmetry.cell_map();
    let transformed = match rules {
        PuzzleRules::Classic => unreachable!("Classic rules were rejected before transformation"),
        PuzzleRules::Diagonal => PuzzleRules::Diagonal,
        PuzzleRules::Jigsaw { regions } => PuzzleRules::Jigsaw {
            regions: regions
                .iter()
                .map(|region| map_cells(region, &mapping))
                .collect(),
        },
        PuzzleRules::Killer { cages } => PuzzleRules::Killer {
            cages: cages
                .iter()
                .map(|cage| Cage {
                    cells: map_cells(&cage.cells, &mapping),
                    sum: if should_complement {
                        // Complementing each digit reflects the total around the cage size.
                        cage.cells.len() as u16 * u16::from(DIGIT_COMPLEMENT_BASE) - cage.sum
                    } else {
                        cage.sum
                    },
                })
                .collect(),
        },
        PuzzleRules::Thermo { paths } => PuzzleRules::Thermo {
            paths: paths
                .iter()
                .map(|path| {
                    let mut path = map_cells(path, &mapping);
                    if should_complement {
                        path.reverse();
                    }
                    path
                })
                .collect(),
        },
        PuzzleRules::Arrow { arrows } => PuzzleRules::Arrow {
            arrows: arrows
                .iter()
                .map(|arrow| Arrow {
                    circle: mapping[arrow.circle],
                    shaft: map_cells(&arrow.shaft, &mapping),
                })
                .collect(),
        },
    };

    Ok(transformed)
}

/// Apply the spatial and digit mappings while leaving empty cells empty.
pub fn transform_board(
    board: &Board,
    symmetry: SpatialSymmetry,
    digit_map: Option<&[u8; 9]>,
    complement: bool,
) -> CoreResult<Board> {
    if let Some(digits) = digit_map {
        let mut used = 0_u16;
        for &digit in digits {
            if !(1..=9).contains(&digit) || used & (1 << (digit - 1)) != 0 {
                return Err(EngineError::invalid("Digit map must be a bijection"));
            }
            used |= 1 << (digit - 1);
        }
    }

    let mapping = symmetry.cell_map();
    let mut values = [0; BOARD_SIZE];
    for (cell, &value) in board.values().iter().enumerate() {
        if value == 0 {
            continue;
        }

        let digit = digit_map.map_or(value, |digits| digits[usize::from(value - 1)]);
        values[mapping[cell]] = if complement {
            DIGIT_COMPLEMENT_BASE - digit
        } else {
            digit
        };
    }

    Ok(Board::from_computed_values(values))
}

/// Rule necessity is a separate exact fact; incomplete counting cannot establish it.
pub fn variant_rules_matter(
    puzzle: &crate::puzzle::Puzzle,
    control: &mut crate::control::ExecutionControl,
) -> CoreResult<crate::types::Bounded<bool>> {
    use crate::types::Bounded;
    let Bounded::Complete(classic) =
        crate::rules::context::prepare_rules(&PuzzleRules::Classic, control)?
    else {
        return Ok(Bounded::Cancelled);
    };

    // A regional terminal invalid under Classic already proves the rule difference.
    let is_jigsaw = matches!(puzzle.rules, PuzzleRules::Jigsaw { .. });
    let needs_regions = is_jigsaw && !crate::board::is_complete(&puzzle.solution, &classic);
    if needs_regions {
        return Ok(Bounded::Complete(needs_regions));
    }

    let result = crate::search::exact::count_with_rules(
        &puzzle.givens,
        &PuzzleRules::Classic,
        control,
        u64::MAX,
    )?;
    Ok(match result {
        crate::search::types::SearchResult::Complete { count, .. } => Bounded::Complete(count != 1),
        crate::search::types::SearchResult::Incomplete { .. } => Bounded::Cancelled,
    })
}
