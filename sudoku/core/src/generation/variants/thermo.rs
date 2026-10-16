use crate::budget::WorkBudget;
use crate::random::SeededRandom;
use crate::rules::topology::cells_touch;
use crate::rules::types::PuzzleRules;
use crate::types::{BOARD_SIZE, Board};

pub fn create_geometry(
    paths: &[Vec<usize>],
    solution: &Board,
    random: &mut SeededRandom,
    budget: &mut WorkBudget,
) -> Option<PuzzleRules> {
    let mut paths = paths.to_vec();
    for _ in 0..8 {
        let mut path = vec![(random.next_f64() * BOARD_SIZE as f64) as usize];
        while path.len() < 5 {
            if !budget.consume(1) {
                return None;
            }

            let end = path[path.len() - 1];
            let choices: Vec<usize> = (0..BOARD_SIZE)
                .filter(|&cell| {
                    !path.contains(&cell)
                        && cells_touch(end, cell, true)
                        && solution.values()[cell] > solution.values()[end]
                })
                .collect();
            if choices.is_empty() {
                break;
            }
            path.push(choices[(random.next_f64() * choices.len() as f64) as usize]);
        }
        if path.len() >= 2 && !paths.contains(&path) {
            paths.push(path);
        }
    }
    Some(PuzzleRules::Thermo { paths })
}
