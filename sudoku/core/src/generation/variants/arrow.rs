use crate::budget::WorkBudget;
use crate::random::SeededRandom;
use crate::rules::topology::cells_touch;
use crate::rules::types::{Arrow, PuzzleRules};
use crate::types::{BOARD_SIZE, Board};

// These v11 geometry bounds fix recursive visit and random-draw order.
const GEOMETRY_ATTEMPTS: usize = 12;
const MAX_GENERATED_ARROWS: usize = 4;
const MIN_SHAFT_LENGTH: usize = 2;
const MAX_SHAFT_LENGTH: usize = 5;
const MIN_CIRCLE_DIGIT: u8 = 3;

fn shaft(
    circle: usize,
    path: &mut Vec<usize>,
    total: u16,
    solution: &Board,
    random: &mut SeededRandom,
    budget: &mut WorkBudget,
) -> Option<Vec<usize>> {
    if !budget.consume(1) {
        return None;
    }
    if total == u16::from(solution.values()[circle]) {
        return if path.len() >= MIN_SHAFT_LENGTH {
            Some(path.to_vec())
        } else {
            None
        };
    }
    if path.len() >= MAX_SHAFT_LENGTH {
        return None;
    }

    let end = path.last().copied().unwrap_or(circle);
    let mut choices: Vec<usize> = (0..BOARD_SIZE)
        .filter(|&cell| {
            cell != circle
                && !path.contains(&cell)
                && cells_touch(end, cell, true)
                && total + u16::from(solution.values()[cell])
                    <= u16::from(solution.values()[circle])
        })
        .collect();
    random.shuffle(&mut choices);
    for cell in choices {
        path.push(cell);
        let result = shaft(
            circle,
            path,
            total + u16::from(solution.values()[cell]),
            solution,
            random,
            budget,
        );
        path.pop();
        if result.is_some() {
            return result;
        }
        if budget.remaining() == 0 {
            return None;
        }
    }
    None
}

pub fn create_geometry(
    arrows: &[Arrow],
    solution: &Board,
    random: &mut SeededRandom,
    budget: &mut WorkBudget,
) -> Option<PuzzleRules> {
    let mut arrows = arrows.to_vec();
    for _ in 0..GEOMETRY_ATTEMPTS {
        if arrows.len() >= MAX_GENERATED_ARROWS {
            break;
        }

        let circle = (random.next_f64() * BOARD_SIZE as f64) as usize;
        if solution.values()[circle] < MIN_CIRCLE_DIGIT {
            continue;
        }

        let path = shaft(
            circle,
            &mut Vec::with_capacity(MAX_SHAFT_LENGTH),
            0,
            solution,
            random,
            budget,
        );
        // Preserve the conservative boundary: a last-unit success still leaves no geometry allowance.
        if budget.remaining() == 0 {
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
