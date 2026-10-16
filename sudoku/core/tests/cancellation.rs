use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use sudoku_core::budget::{CancellationProbe, Controlled, WorkBudget};

#[derive(Debug)]
struct Flag(AtomicBool);
impl CancellationProbe for Flag {
    fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::Relaxed)
    }
}

#[test]
fn cancellation_retains_charges_and_is_not_exhaustion() {
    let flag = Arc::new(Flag(AtomicBool::new(false)));
    let mut budget = WorkBudget::with_cancellation(100, flag.clone());
    assert!(budget.consume(7));
    flag.0.store(true, Ordering::Relaxed);

    assert!(!budget.consume(3));
    assert_eq!(budget.used(), 7);
    assert_eq!(budget.remaining(), 93);
    assert_eq!(
        budget.finish("ignored"),
        Controlled::Cancelled { work_used: 7 }
    );
}

#[test]
fn inactive_probe_preserves_work_contract() {
    let flag = Arc::new(Flag(AtomicBool::new(false)));
    let mut controlled = WorkBudget::with_cancellation(10, flag);
    let mut original = WorkBudget::new(10);

    for units in [2, 3, 8, 5] {
        assert_eq!(controlled.consume(units), original.consume(units));
    }
    assert_eq!(controlled.accounting(), original.accounting());
    assert_eq!(controlled.finish(12), Controlled::Complete(12));
}

#[test]
fn caller_owned_evidence_budget_retains_cancellation() {
    use sudoku_core::{
        hint::{HintResult, HintUnavailable},
        rules::types::PuzzleRules,
    };
    let flag = Arc::new(Flag(AtomicBool::new(true)));
    let mut budget = WorkBudget::with_cancellation(1_000_000, flag);
    let result = sudoku_core::logic::hint_validation::validate_hint_evidence_with_budget(
        &HintResult::Unavailable(HintUnavailable::Complete),
        &PuzzleRules::Classic,
        None,
        &mut budget,
    );

    assert!(matches!(
        budget.finish(result),
        Controlled::Cancelled { work_used: 0 }
    ));
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
    let mut setup = WorkBudget::new(4_000_000);
    let Bounded::Complete(prepared) =
        prepare_computation(&PuzzleRules::Classic, &mut setup).unwrap()
    else {
        panic!("preparation must fit");
    };
    let board = Board::EMPTY;
    let mut cancelled = WorkBudget::with_cancellation(
        4_000_000,
        Arc::new(AfterChecks(std::sync::atomic::AtomicUsize::new(0))),
    );

    let result = count_solutions(&board, &prepared, &mut cancelled, 4_000_000);

    assert!(
        matches!(cancelled.finish(result), Controlled::Cancelled { work_used } if work_used > 0 && work_used < 4_000_000)
    );
    let mut first = WorkBudget::new(4_000_000);
    let mut second = WorkBudget::new(4_000_000);
    let repeated = count_solutions(&board, &prepared, &mut first, 4_000_000);
    assert!(matches!(repeated, SearchResult::Complete { count: 2, .. }));
    assert_eq!(
        repeated,
        count_solutions(&board, &prepared, &mut second, 4_000_000)
    );
}

#[test]
fn inactive_generation_probe_preserves_results_and_every_work_stage() {
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
        max_work: 20_000,
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
    assert_eq!(
        original.metrics.work_by_stage,
        controlled.metrics.work_by_stage
    );
    assert_eq!(
        original.metrics.construction_work,
        controlled.metrics.construction_work
    );
    assert!(matches!(
        controlled.outcome,
        GenerationOutcome::BudgetExhausted { .. } | GenerationOutcome::Ready { .. }
    ));
}

#[test]
fn rejected_multiunit_charge_is_observable_without_spending_remaining_work() {
    let mut budget = WorkBudget::new(100);
    assert!(budget.consume(90));

    assert!(!budget.consume(20));
    assert!(budget.is_exhausted());
    assert_eq!(budget.remaining(), 10);
}
