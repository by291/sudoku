#[path = "support/rules.rs"]
pub mod fixtures;

use sudoku_core::budget::WorkBudget;
use sudoku_core::generation::terminal_construction::{
    TerminalConstructionResult, construct_unit_terminal,
};
use sudoku_core::random::{Seed, SeededRandom};
use sudoku_core::rules::context::compile_rules;
use sudoku_core::rules::types::PuzzleRules;

#[test]
fn regional_node_exhaustion_preserves_allowance_and_never_leaks_partial_state() {
    let geometry: serde_json::Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/engine-contracts/geometry.json"
    ))
    .unwrap();
    let rules = fixtures::decode_rules(&geometry["jigsaw"]["rules"]).unwrap();
    let prepared = compile_rules(&rules).unwrap();
    let seed = Seed::from_bytes([0; 32]);
    let mut budget = WorkBudget::new(100);

    let result = construct_unit_terminal(
        &prepared,
        &mut SeededRandom::new(&seed),
        &mut budget,
        Some(0),
    );

    assert!(matches!(
        result,
        TerminalConstructionResult::AttemptExhausted
    ));
    assert_eq!(budget.used(), 9);
    assert_eq!(budget.remaining(), 91);
    let first = construct_unit_terminal(
        &prepared,
        &mut SeededRandom::new(&seed),
        &mut WorkBudget::new(100000),
        None,
    );
    let second = construct_unit_terminal(
        &prepared,
        &mut SeededRandom::new(&seed),
        &mut WorkBudget::new(100000),
        None,
    );
    match (first, second) {
        (
            TerminalConstructionResult::Ready { solution: first },
            TerminalConstructionResult::Ready { solution: second },
        ) => assert_eq!(first, second),
        (
            TerminalConstructionResult::AttemptExhausted,
            TerminalConstructionResult::AttemptExhausted,
        ) => {}
        _ => panic!("Repeated prepared geometry must retain no abandoned board state"),
    }
}

#[test]
fn exact_terminal_allowance_completes_and_one_short_publishes_no_grid() {
    let rules = compile_rules(&PuzzleRules::Classic).unwrap();
    let seed = Seed::from_bytes([1; 32]);
    let mut measured = WorkBudget::new(100000);
    let TerminalConstructionResult::Ready { solution } =
        construct_unit_terminal(&rules, &mut SeededRandom::new(&seed), &mut measured, None)
    else {
        panic!("Expected terminal");
    };

    let exact = construct_unit_terminal(
        &rules,
        &mut SeededRandom::new(&seed),
        &mut WorkBudget::new(measured.used()),
        None,
    );
    let short = construct_unit_terminal(
        &rules,
        &mut SeededRandom::new(&seed),
        &mut WorkBudget::new(measured.used() - 1),
        None,
    );

    let TerminalConstructionResult::Ready { solution: repeated } = exact else {
        panic!("Exact work allowance must finish");
    };
    assert_eq!(solution, repeated);
    assert!(matches!(short, TerminalConstructionResult::BudgetExhausted));
    for row in 0..9 {
        let mut digits = solution.values()[row * 9..row * 9 + 9].to_vec();
        digits.sort_unstable();
        assert_eq!(digits, vec![1, 2, 3, 4, 5, 6, 7, 8, 9]);
    }
}

#[test]
fn arithmetic_clues_are_rejected_before_terminal_search_or_draws() {
    let geometry: serde_json::Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/engine-contracts/geometry.json"
    ))
    .unwrap();
    let rules = fixtures::decode_rules(&geometry["killer"]["rules"]).unwrap();
    let prepared = compile_rules(&rules).unwrap();
    let seed = Seed::from_bytes([0; 32]);
    let mut random = SeededRandom::new(&seed);
    let mut budget = WorkBudget::new(100000);

    let result = construct_unit_terminal(&prepared, &mut random, &mut budget, None);

    assert!(matches!(result, TerminalConstructionResult::Failed { .. }));
    assert_eq!(budget.used(), 0);
    assert_eq!(random.next_u32(), SeededRandom::new(&seed).next_u32());
}
