#[path = "support/rules.rs"]
pub mod fixtures;

use sudoku_core::budget::WorkBudget;
use sudoku_core::constraints::candidates::evaluate_candidates;
use sudoku_core::constraints::conflicts::evaluate_conflicts;
use sudoku_core::constraints::types::{CandidateResult, ConflictStatus};
use sudoku_core::rules::context::compile_rules;
use sudoku_core::rules::types::PuzzleRules;
use sudoku_core::types::Board;

#[test]
fn partial_conflicts_remain_marked_incomplete() {
    let prepared = compile_rules(&PuzzleRules::Thermo {
        paths: vec![vec![0, 10, 20]],
    })
    .unwrap();
    let mut values = [0_u8; 81];
    values[1] = 1;
    values[2] = 1;
    let board = Board::try_from(values.as_slice()).unwrap();
    let mut budget = WorkBudget::new(0);

    let result = evaluate_conflicts(&board, &prepared, &mut budget);

    assert_eq!(result.status, ConflictStatus::BudgetExhausted);
    assert!(!result.violations.is_empty());
    assert_eq!(result.violations[0].constraint_id, "row:0");
}

#[test]
fn prepared_geometry_cannot_be_mutated_by_results() {
    let prepared = compile_rules(&PuzzleRules::Thermo {
        paths: vec![vec![0, 10, 20]],
    })
    .unwrap();
    let board = Board::try_from([0_u8; 81].as_slice()).unwrap();
    let mut budget = WorkBudget::new(100000);
    let CandidateResult::Complete(mut candidates) =
        evaluate_candidates(&board, &prepared, &mut budget)
    else {
        panic!("Expected candidates");
    };
    candidates.fill(sudoku_core::types::CandidateMask::EMPTY);
    let mut repeated = WorkBudget::new(100000);

    let CandidateResult::Complete(next) = evaluate_candidates(&board, &prepared, &mut repeated)
    else {
        panic!("Expected candidates");
    };

    // A three-cell increasing path independently permits 1..7, 2..8 and 3..9.
    assert_eq!(
        [next[0].bits(), next[10].bits(), next[20].bits()],
        [127, 254, 508]
    );
    assert_eq!(budget.used(), repeated.used());
}

#[test]
fn live_cost_classifies_every_current_primitive_conservatively() {
    use sudoku_core::constraints::computation::prepare_computation;
    use sudoku_core::constraints::types::LiveComputationCost;
    use sudoku_core::rules::types::{Arrow, Cage};
    use sudoku_core::types::Bounded;

    let small = [
        PuzzleRules::Classic,
        PuzzleRules::Diagonal,
        PuzzleRules::Jigsaw {
            regions: (0..9)
                .map(|region| {
                    (0..9)
                        .map(|cell| (region / 3 * 3 + cell / 3) * 9 + region % 3 * 3 + cell % 3)
                        .collect()
                })
                .collect(),
        },
        PuzzleRules::Killer {
            cages: (0..81)
                .map(|cell| Cage {
                    cells: vec![cell],
                    sum: 1,
                })
                .collect(),
        },
        PuzzleRules::Thermo {
            paths: vec![vec![0, 10, 20]],
        },
        PuzzleRules::Arrow {
            arrows: vec![Arrow {
                circle: 0,
                shaft: vec![1, 2],
            }],
        },
    ];
    for rules in small {
        let Bounded::Complete(prepared) =
            prepare_computation(&rules, &mut WorkBudget::new(1000000)).unwrap()
        else {
            panic!("Expected prepared rules");
        };
        assert_eq!(prepared.live_computation_cost(), LiveComputationCost::Small);
    }
    let large = PuzzleRules::Killer {
        cages: (0..9)
            .map(|row| Cage {
                cells: (0..9).map(|column| row * 9 + column).collect(),
                sum: 45,
            })
            .collect(),
    };
    let Bounded::Complete(prepared) =
        prepare_computation(&large, &mut WorkBudget::new(1000000)).unwrap()
    else {
        panic!("Expected prepared rules");
    };
    assert_eq!(
        prepared.live_computation_cost(),
        LiveComputationCost::HeavyEnumeration
    );
}
