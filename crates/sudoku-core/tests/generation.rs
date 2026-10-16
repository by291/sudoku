use sudoku_core::generation::generate::generate_puzzle;
use sudoku_core::generation::types::{
    GenerationExhaustionCause, GenerationInput, GenerationLimits, GenerationOutcome,
};
use sudoku_core::random::Seed;
use sudoku_core::rules::types::SudokuVariant;
use sudoku_core::types::Difficulty;

#[test]
fn layout_limit_does_not_discard_existing_frontiers() {
    let input = GenerationInput::new(
        SudokuVariant::Classic,
        Difficulty::Easy,
        Seed::from_bytes([0; 32]),
    )
    .unwrap();
    let limits = GenerationLimits {
        max_layouts: 1,
        ..GenerationLimits::default()
    };

    let result = generate_puzzle(&input, &limits).unwrap();

    assert!(matches!(result.outcome, GenerationOutcome::Ready { .. }));
    assert_eq!(result.metrics.layouts, 1);
    assert_eq!(result.metrics.completed_layouts, 1);
    assert!(result.metrics.candidate_visits >= 45);
    assert_eq!(
        result.metrics.work_by_stage.total(),
        result.metrics.construction_work
    );
}

#[test]
fn work_and_layout_exhaustion_never_expose_partial_puzzles() {
    let input = GenerationInput::new(
        SudokuVariant::Classic,
        Difficulty::Hard,
        Seed::from_bytes([0; 32]),
    )
    .unwrap();
    for max_work in [0, 1, 20] {
        let limits = GenerationLimits {
            max_work,
            ..GenerationLimits::default()
        };

        let result = generate_puzzle(&input, &limits).unwrap();

        assert!(matches!(
            result.outcome,
            GenerationOutcome::BudgetExhausted {
                cause: GenerationExhaustionCause::WorkLimit
            }
        ));
        assert_eq!(result.metrics.construction_work, max_work);
        assert_eq!(result.metrics.work_by_stage.total(), max_work);
    }
    let limits = GenerationLimits {
        max_layouts: 0,
        ..GenerationLimits::default()
    };
    let result = generate_puzzle(&input, &limits).unwrap();
    assert!(matches!(
        result.outcome,
        GenerationOutcome::BudgetExhausted {
            cause: GenerationExhaustionCause::LayoutLimit
        }
    ));
    assert_eq!(result.metrics.construction_work, 0);
}
