use crate::control::ExecutionControl;
use crate::random::SeededRandom;
use crate::rules::topology::{Adjacency, cells_touch};
use crate::rules::types::{Arrow, PuzzleRules};
use crate::types::{BOARD_SIZE, Board};

// These v11 geometry bounds fix recursive visit and random-draw order.
const GEOMETRY_ATTEMPTS: usize = 12;
const MAX_GENERATED_ARROWS: usize = 4;
const MIN_SHAFT_LENGTH: usize = 2;
const MAX_SHAFT_LENGTH: usize = 5;
const MIN_CIRCLE_DIGIT: u8 = 3;

struct ShaftSearch<'a> {
    circle: usize,
    solution: &'a Board,
    random: &'a mut SeededRandom,
    control: &'a mut ExecutionControl,
}

impl ShaftSearch<'_> {
    fn find_shaft(&mut self, path: &mut Vec<usize>, total: u16) -> Option<Vec<usize>> {
        if !self.control.check() {
            return None;
        }
        if total == u16::from(self.solution.values()[self.circle]) {
            return if path.len() >= MIN_SHAFT_LENGTH {
                Some(path.to_vec())
            } else {
                None
            };
        }
        if path.len() >= MAX_SHAFT_LENGTH {
            return None;
        }

        let end = path.last().copied().unwrap_or(self.circle);
        let mut choices: Vec<usize> = (0..BOARD_SIZE)
            .filter(|&cell| {
                cell != self.circle
                    && !path.contains(&cell)
                    && cells_touch(end, cell, Adjacency::IncludingDiagonal)
                    && total + u16::from(self.solution.values()[cell])
                        <= u16::from(self.solution.values()[self.circle])
            })
            .collect();
        self.random.shuffle(&mut choices);
        for cell in choices {
            path.push(cell);
            let next_total = total + u16::from(self.solution.values()[cell]);
            let result = self.find_shaft(path, next_total);

            // Restore the shared path before exploring another branch or propagating a stop.
            path.pop();
            if result.is_some() {
                return result;
            }
            if self.control.is_cancelled() {
                return None;
            }
        }

        None
    }
}

/// Extend the initial arrows with shafts whose digits sum to their circle.
pub(in crate::generation) fn create_geometry(
    arrows: &[Arrow],
    input: super::GeometryInput<'_>,
) -> Option<PuzzleRules> {
    let super::GeometryInput {
        terminal: solution,
        random,
        control,
    } = input;
    let mut arrows = arrows.to_vec();

    for _ in 0..GEOMETRY_ATTEMPTS {
        if arrows.len() >= MAX_GENERATED_ARROWS {
            break;
        }

        let circle = (random.next_f64() * BOARD_SIZE as f64) as usize;
        if solution.values()[circle] < MIN_CIRCLE_DIGIT {
            continue;
        }

        let mut search = ShaftSearch {
            circle,
            solution,
            random,
            control,
        };
        let mut shaft = Vec::with_capacity(MAX_SHAFT_LENGTH);
        let path = search.find_shaft(&mut shaft, 0);

        // Cancellation must not publish a partially constructed geometry.
        if control.is_cancelled() {
            return None;
        }
        if let Some(path) = path {
            arrows.push(Arrow {
                circle,
                shaft: path,
            });
        }
    }

    Some(PuzzleRules::Arrow { arrows })
}
