use super::variant_strategies::capabilities;
use crate::rules::context::validate_rules;
use crate::rules::types::{Arrow, Cage, PuzzleRules};
use crate::types::{BOARD_SIZE, Board, CoreResult, EngineError};

#[derive(Clone, Copy, Debug)]
pub struct SpatialSymmetry(u8);

impl TryFrom<u8> for SpatialSymmetry {
    type Error = EngineError;
    fn try_from(value: u8) -> CoreResult<Self> {
        if value < 8 {
            Ok(Self(value))
        } else {
            Err(EngineError::invalid("Spatial symmetry must be in 0..=7"))
        }
    }
}

impl SpatialSymmetry {
    pub(crate) fn from_draw(value: usize) -> Self {
        debug_assert!(value < 8);
        Self(value as u8)
    }

    pub fn cell_map(self) -> [usize; BOARD_SIZE] {
        std::array::from_fn(|cell| {
            let mut row = cell / 9;
            let mut column = cell % 9;
            if self.0 >= 4 {
                column = 8 - column;
            }
            for _ in 0..self.0 % 4 {
                (row, column) = (column, 8 - row);
            }
            row * 9 + column
        })
    }
}

/// Transform validated clue geometry only with permitted rule-preserving symmetries/complements.
pub fn transform_rules(
    rules: &PuzzleRules,
    symmetry: SpatialSymmetry,
    complement: bool,
) -> CoreResult<PuzzleRules> {
    validate_rules(rules)?;
    if matches!(rules, PuzzleRules::Classic) {
        return Err(EngineError::invalid(
            "Classic uses its own terminal construction",
        ));
    }
    if complement && !capabilities(rules.variant()).allows_complement {
        return Err(EngineError::invalid(
            "Complement does not preserve arrow sums",
        ));
    }

    let mapping = symmetry.cell_map();
    let transformed = match rules {
        PuzzleRules::Classic => {
            return Err(EngineError::invalid(
                "Classic uses its own terminal construction",
            ));
        }
        PuzzleRules::Diagonal => PuzzleRules::Diagonal,
        PuzzleRules::Jigsaw { regions } => PuzzleRules::Jigsaw {
            regions: regions
                .iter()
                .map(|region| region.iter().map(|&cell| mapping[cell]).collect())
                .collect(),
        },
        PuzzleRules::Killer { cages } => PuzzleRules::Killer {
            cages: cages
                .iter()
                .map(|cage| Cage {
                    cells: cage.cells.iter().map(|&cell| mapping[cell]).collect(),
                    sum: if complement {
                        cage.cells.len() as u16 * 10 - cage.sum
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
                    let mut path: Vec<usize> = path.iter().map(|&cell| mapping[cell]).collect();
                    if complement {
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
                    shaft: arrow.shaft.iter().map(|&cell| mapping[cell]).collect(),
                })
                .collect(),
        },
    };
    Ok(transformed)
}

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
        values[mapping[cell]] = if complement { 10 - digit } else { digit };
    }
    Ok(Board::from_computed_values(values))
}

/// Rule necessity is a separate exact fact; incomplete counting cannot establish it.
pub fn variant_rules_matter(
    puzzle: &crate::puzzle::Puzzle,
    budget: &mut crate::budget::WorkBudget,
) -> CoreResult<crate::types::Bounded<bool>> {
    use crate::types::Bounded;
    let Bounded::Complete(classic) =
        crate::rules::context::prepare_rules(&PuzzleRules::Classic, budget)?
    else {
        return Ok(Bounded::BudgetExhausted);
    };
    if matches!(puzzle.rules, PuzzleRules::Jigsaw { .. })
        && !crate::board::is_complete(&puzzle.solution, &classic)
    {
        return Ok(Bounded::Complete(true));
    }

    let result = crate::search::exact::count_with_rules(
        &puzzle.givens,
        &PuzzleRules::Classic,
        budget,
        budget.remaining(),
    )?;
    Ok(match result {
        crate::search::types::SearchResult::Complete { count, .. } => Bounded::Complete(count != 1),
        crate::search::types::SearchResult::BudgetExhausted { .. } => Bounded::BudgetExhausted,
    })
}
