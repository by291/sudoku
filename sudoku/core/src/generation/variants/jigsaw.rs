use crate::budget::WorkBudget;
use crate::random::SeededRandom;
use crate::rules::context::validate_rules;
use crate::rules::types::PuzzleRules;
use crate::types::Board;

// Canonical geometry from the independently sealed geometry.json; no teaching board is used to generate puzzles.
pub const REGION_PRESET: [[usize; 9]; 9] = [
    [0, 1, 12, 9, 10, 11, 18, 19, 20],
    [3, 4, 5, 2, 13, 14, 21, 22, 23],
    [6, 7, 8, 15, 16, 17, 24, 25, 26],
    [27, 28, 29, 36, 37, 38, 45, 46, 47],
    [30, 31, 32, 39, 40, 41, 48, 49, 50],
    [33, 34, 35, 42, 43, 44, 51, 52, 53],
    [54, 55, 56, 63, 64, 65, 72, 73, 74],
    [57, 58, 59, 66, 67, 68, 75, 76, 77],
    [60, 61, 62, 69, 70, 71, 78, 79, 80],
];

pub fn irregular_regions(regions: &[Vec<usize>]) -> bool {
    regions.iter().any(|region| {
        let Some(&first) = region.first() else {
            return false;
        };
        let mut top = first / 9;
        let mut bottom = top;
        let mut left = first % 9;
        let mut right = left;
        for &cell in region {
            top = top.min(cell / 9);
            bottom = bottom.max(cell / 9);
            left = left.min(cell % 9);
            right = right.max(cell % 9);
        }
        (bottom - top + 1) * (right - left + 1) != region.len()
    })
}

pub fn create_geometry(
    regions: &[Vec<usize>],
    solution: &Board,
    random: &mut SeededRandom,
    budget: &mut WorkBudget,
) -> Option<PuzzleRules> {
    let mut regions = regions.to_vec();
    for _ in 0..20 {
        if !budget.consume(1) {
            return None;
        }

        let first = (random.next_f64() * 81.0) as usize;
        let second = (random.next_f64() * 81.0) as usize;
        if first == second || solution.values()[first] != solution.values()[second] {
            continue;
        }

        let first_region = regions.iter().position(|region| region.contains(&first));
        let second_region = regions.iter().position(|region| region.contains(&second));
        if first_region == second_region {
            continue;
        }

        let candidate: Vec<Vec<usize>> = regions
            .iter()
            .enumerate()
            .map(|(index, region)| {
                region
                    .iter()
                    .map(|&cell| {
                        if Some(index) == first_region && cell == first {
                            second
                        } else if Some(index) == second_region && cell == second {
                            first
                        } else {
                            cell
                        }
                    })
                    .collect()
            })
            .collect();
        let proposed = PuzzleRules::Jigsaw {
            regions: candidate.clone(),
        };
        if validate_rules(&proposed).is_ok() && irregular_regions(&candidate) {
            regions = candidate;
        }
    }
    Some(PuzzleRules::Jigsaw { regions })
}
