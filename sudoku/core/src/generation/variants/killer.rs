use std::sync::OnceLock;

use crate::control::ExecutionControl;
use crate::random::SeededRandom;
use crate::rules::topology::cells_touch;
use crate::rules::types::{Cage, PuzzleRules};
use crate::types::{BOARD_SIZE, Board};

// These v11 cage sizes fix growth choices and random draws; larger cages use different support costs.
const MIN_GENERATED_CAGE_SIZE: usize = 2;
const MAX_GENERATED_CAGE_SIZE: usize = 4;

fn neighbours() -> &'static [Vec<usize>; BOARD_SIZE] {
    static NEIGHBOURS: OnceLock<[Vec<usize>; BOARD_SIZE]> = OnceLock::new();
    NEIGHBOURS.get_or_init(|| {
        std::array::from_fn(|cell| {
            (0..BOARD_SIZE)
                .filter(|&other| cells_touch(cell, other, false))
                .collect()
        })
    })
}

fn unused_neighbour_count(cell: usize, present: &[bool; BOARD_SIZE]) -> usize {
    neighbours()[cell]
        .iter()
        .filter(|&&other| present[other])
        .count()
}

pub fn create_geometry(
    solution: &Board,
    random: &mut SeededRandom,
    control: &mut ExecutionControl,
) -> Option<PuzzleRules> {
    let mut remaining: Vec<usize> = (0..BOARD_SIZE).collect();
    random.shuffle(&mut remaining);
    let mut present = [true; BOARD_SIZE];
    let mut cages = vec![];
    while !remaining.is_empty() {
        if !control.check() {
            return None;
        }

        let mut first = None;
        let mut fewest_open_sides = usize::MAX;
        // Preserve shuffled insertion order while growing from the narrowest free corner.
        for &cell in &remaining {
            if !control.check() {
                return None;
            }

            let open_sides = unused_neighbour_count(cell, &present);
            if open_sides < fewest_open_sides {
                first = Some(cell);
                fewest_open_sides = open_sides;
            }
        }

        let Some(first) = first else {
            panic!("Nonempty cage frontier has no starting cell");
        };
        let mut cells = vec![first];
        remaining.retain(|&cell| cell != first);
        present[first] = false;
        let size = MIN_GENERATED_CAGE_SIZE
            + (random.next_f64() * (MAX_GENERATED_CAGE_SIZE - MIN_GENERATED_CAGE_SIZE + 1) as f64)
                as usize;
        while cells.len() < size {
            let mut choices = vec![];
            let mut crowded = vec![];
            for &cell in &remaining {
                if !control.check() {
                    return None;
                }
                if !cells
                    .iter()
                    .any(|&other| neighbours()[other].contains(&cell))
                    || cells
                        .iter()
                        .any(|&other| solution.values()[other] == solution.values()[cell])
                {
                    continue;
                }
                choices.push(cell);
                if unused_neighbour_count(cell, &present) <= 1 {
                    crowded.push(cell);
                }
            }
            if choices.is_empty() {
                break;
            }
            // Absorb a neighbour losing its last free connection before ordinary choices.
            let eligible = if crowded.is_empty() {
                &choices
            } else {
                &crowded
            };
            let next = eligible[(random.next_f64() * eligible.len() as f64) as usize];
            cells.push(next);
            remaining.retain(|&cell| cell != next);
            present[next] = false;
        }

        let sum = cells
            .iter()
            .map(|&cell| u16::from(solution.values()[cell]))
            .sum();
        cages.push(Cage { cells, sum });
    }
    Some(PuzzleRules::Killer { cages })
}
