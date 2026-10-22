use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use sudoku_core::control::{CancellationProbe, Controlled, ExecutionControl};

#[derive(Debug)]
struct Flag(AtomicBool);
impl CancellationProbe for Flag {
    fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::Relaxed)
    }
}

#[test]
fn cancellation_stops_checks_and_discards_results() {
    let flag = Arc::new(Flag(AtomicBool::new(false)));
    let control = ExecutionControl::with_cancellation(flag.clone());
    assert!(control.check());
    flag.0.store(true, Ordering::Relaxed);

    assert!(!control.check());

    assert_eq!(control.finish("ignored"), Controlled::Cancelled);
}

#[test]
fn inactive_probe_preserves_completion() {
    let flag = Arc::new(Flag(AtomicBool::new(false)));
    let controlled = ExecutionControl::with_cancellation(flag);
    let original = ExecutionControl::new();

    for _ in 0..4 {
        assert_eq!(controlled.check(), original.check());
    }

    assert_eq!(controlled.finish(12), Controlled::Complete(12));
}

#[test]
fn caller_owned_evidence_control_retains_cancellation() {
    use sudoku_core::{
        hint::{HintResult, HintUnavailable},
        rules::types::PuzzleRules,
    };
    let flag = Arc::new(Flag(AtomicBool::new(true)));
    let mut control = ExecutionControl::with_cancellation(flag);
    let result = sudoku_core::logic::hint_validation::validate_hint_evidence_with_control(
        &HintResult::Unavailable(HintUnavailable::Complete),
        &PuzzleRules::Classic,
        None,
        &mut control,
    );

    assert!(matches!(control.finish(result), Controlled::Cancelled));
}

#[derive(Debug)]
struct AfterChecks(std::sync::atomic::AtomicUsize);
impl CancellationProbe for AfterChecks {
    fn is_cancelled(&self) -> bool {
        self.0.fetch_add(1, Ordering::Relaxed) >= 100
    }
}

#[test]
fn cancelled_search_releases_workspace_without_poisoning_preparation() {
    use sudoku_core::{
        constraints::computation::prepare_computation,
        rules::types::PuzzleRules,
        search::{exact::count_solutions, types::SearchResult},
        types::{Board, Bounded},
    };
    let mut setup = ExecutionControl::new();
    let Bounded::Complete(prepared) =
        prepare_computation(&PuzzleRules::Classic, &mut setup).unwrap()
    else {
        panic!("preparation must fit");
    };
    let board = Board::EMPTY;
    let mut cancelled = ExecutionControl::with_cancellation(Arc::new(AfterChecks(
        std::sync::atomic::AtomicUsize::new(0),
    )));

    let result = count_solutions(&board, &prepared, &mut cancelled, 4_000_000);

    assert!(matches!(cancelled.finish(result), Controlled::Cancelled));
    let mut first = ExecutionControl::new();
    let mut second = ExecutionControl::new();
    let repeated = count_solutions(&board, &prepared, &mut first, 4_000_000);
    assert!(matches!(repeated, SearchResult::Complete { count: 2, .. }));
    assert_eq!(
        repeated,
        count_solutions(&board, &prepared, &mut second, 4_000_000)
    );
}

#[test]
fn inactive_generation_probe_preserves_results() {
    use sudoku_core::{
        generation::{
            generate::{generate_puzzle, generate_puzzle_controlled},
            types::{GenerationInput, GenerationLimits, GenerationOutcome},
        },
        random::Seed,
        rules::types::SudokuVariant,
        types::Difficulty,
    };
    let input = GenerationInput::new(
        SudokuVariant::Classic,
        Difficulty::Easy,
        Seed::try_from(&[0_u8; 32][..]).unwrap(),
    )
    .unwrap();
    let limits = GenerationLimits {
        ..GenerationLimits::default()
    };
    let original = generate_puzzle(&input, &limits).unwrap();
    let Controlled::Complete(controlled) =
        generate_puzzle_controlled(&input, &limits, Arc::new(Flag(AtomicBool::new(false))))
            .unwrap()
    else {
        panic!("inactive token cannot cancel");
    };

    assert_eq!(
        format!("{:?}", original.outcome),
        format!("{:?}", controlled.outcome)
    );

    assert!(matches!(
        controlled.outcome,
        GenerationOutcome::Incomplete { .. } | GenerationOutcome::Ready { .. }
    ));
}

#[test]
fn cancellation_interrupts_generation_without_publishing_a_partial_puzzle() {
    use sudoku_core::{
        generation::{
            generate::generate_puzzle_controlled,
            types::{GenerationInput, GenerationLimits},
        },
        random::Seed,
        rules::types::SudokuVariant,
        types::Difficulty,
    };
    for variant in [
        SudokuVariant::Classic,
        SudokuVariant::Diagonal,
        SudokuVariant::Jigsaw,
        SudokuVariant::Killer,
        SudokuVariant::Thermo,
        SudokuVariant::Arrow,
    ] {
        let input =
            GenerationInput::new(variant, Difficulty::Easy, Seed::from_bytes([0; 32])).unwrap();
        let result = generate_puzzle_controlled(
            &input,
            &GenerationLimits::default(),
            Arc::new(AfterChecks(std::sync::atomic::AtomicUsize::new(0))),
        )
        .unwrap();

        assert!(matches!(result, Controlled::Cancelled), "{variant:?}");
    }
}

#[test]
fn cancellation_during_classic_preparation_is_incomplete_not_invalid() {
    use sudoku_core::{
        generation::{
            generate::generate_puzzle_with_control,
            types::{
                GenerationExhaustionCause, GenerationInput, GenerationLimits, GenerationOutcome,
            },
        },
        random::Seed,
        rules::types::SudokuVariant,
        types::Difficulty,
    };
    #[derive(Debug)]
    struct AfterFirstCheck(AtomicBool);
    impl CancellationProbe for AfterFirstCheck {
        fn is_cancelled(&self) -> bool {
            self.0.swap(true, Ordering::Relaxed)
        }
    }
    let input = GenerationInput::new(
        SudokuVariant::Classic,
        Difficulty::Easy,
        Seed::from_bytes([0; 32]),
    )
    .unwrap();
    let mut control =
        ExecutionControl::with_cancellation(Arc::new(AfterFirstCheck(AtomicBool::new(false))));

    let result = generate_puzzle_with_control(&input, &GenerationLimits::default(), &mut control)
        .expect("Cancellation during preparation is not invalid puzzle input");

    assert!(matches!(
        result.outcome,
        GenerationOutcome::Incomplete {
            cause: GenerationExhaustionCause::Cancelled
        }
    ));
    assert_eq!(result.metrics.completed_layouts, 0);
    assert_eq!(result.metrics.candidate_visits, 0);
}
