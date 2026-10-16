use crate::budget::WorkBudget;
use crate::random::SeededRandom;
use crate::rules::topology::cells_touch;
use crate::rules::types::{Arrow, PuzzleRules};
use crate::types::{BOARD_SIZE, Board};

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
        return if path.len() >= 2 {
            Some(path.to_vec())
        } else {
            None
        };
    }
    if path.len() >= 5 {
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
    for _ in 0..12 {
        if arrows.len() >= 4 {
            break;
        }

        let circle = (random.next_f64() * BOARD_SIZE as f64) as usize;
        if solution.values()[circle] < 3 {
            continue;
        }

        let path = shaft(
            circle,
            &mut Vec::with_capacity(5),
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
