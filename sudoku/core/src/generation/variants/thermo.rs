use crate::control::ExecutionControl;
use crate::random::SeededRandom;
use crate::rules::topology::cells_touch;
use crate::rules::types::PuzzleRules;
use crate::types::{BOARD_SIZE, Board};

// These v11 geometry bounds fix path-extension visits and random-draw order.
const GEOMETRY_ATTEMPTS: usize = 8;
const MIN_PATH_LENGTH: usize = 2;
const MAX_PATH_LENGTH: usize = 5;

pub fn create_geometry(
    paths: &[Vec<usize>],
    solution: &Board,
    random: &mut SeededRandom,
    control: &mut ExecutionControl,
) -> Option<PuzzleRules> {
    let mut paths = paths.to_vec();
    for _ in 0..GEOMETRY_ATTEMPTS {
        let mut path = vec![(random.next_f64() * BOARD_SIZE as f64) as usize];
        while path.len() < MAX_PATH_LENGTH {
            if !control.check() {
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
        if path.len() >= MIN_PATH_LENGTH && !paths.contains(&path) {
            paths.push(path);
        }
    }
    Some(PuzzleRules::Thermo { paths })
}
