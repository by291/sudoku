use sudoku_core::budget::WorkBudget;
use sudoku_core::editing::{BoardEdit, BoardLayers, EditOutcome, edit_board};
use sudoku_core::rules::context::compile_rules;
use sudoku_core::rules::types::{Arrow, PuzzleRules};
use sudoku_core::types::{Board, CandidateMask, CellIndex, Digit};

#[test]
fn editing_cleans_only_duplicate_peer_notes() {
    let givens = Board::try_from([0_u8; 81].as_slice()).unwrap();
    let before = BoardLayers {
        entries: givens.clone(),
        notes: [CandidateMask::ALL; 81],
    };
    let prepared = compile_rules(&PuzzleRules::Arrow {
        arrows: vec![Arrow {
            circle: 2,
            shaft: vec![12, 22, 32],
        }],
    })
    .unwrap();
    let action = BoardEdit::Enter {
        cell: CellIndex::try_from(12_usize).unwrap(),
        digit: Digit::try_from(2).unwrap(),
    };
    let mut budget = WorkBudget::new(100000);

    let EditOutcome::Complete(outcome) =
        edit_board(&givens, &before, &action, &prepared, &mut budget).unwrap()
    else {
        panic!("Expected complete edit");
    };

    assert_eq!(outcome.layers.entries.values()[12], 2);
    assert_eq!(outcome.layers.notes[12].bits(), 0);
    assert_eq!(outcome.layers.notes[22].bits(), 509);
    assert_eq!(outcome.layers.notes[32].bits(), 511);
    assert_eq!(givens.values(), &[0; 81]);
    assert_eq!(before.notes[22].bits(), 511);
}

#[test]
fn exhausted_generate_notes_preserves_layers() {
    let givens = Board::try_from([0_u8; 81].as_slice()).unwrap();
    let before = BoardLayers {
        entries: givens.clone(),
        notes: [CandidateMask::ALL; 81],
    };
    let original = before.clone();
    let prepared = compile_rules(&PuzzleRules::Thermo {
        paths: vec![vec![0, 10, 20]],
    })
    .unwrap();
    let mut budget = WorkBudget::new(0);

    let result = edit_board(
        &givens,
        &before,
        &BoardEdit::GenerateNotes,
        &prepared,
        &mut budget,
    )
    .unwrap();

    assert!(matches!(result, EditOutcome::BudgetExhausted));
    assert_eq!(before, original);
    assert_eq!(givens.values(), &[0; 81]);
}

#[test]
fn completed_givens_cannot_be_edited_and_completion_is_a_board_fact() {
    let values = std::array::from_fn::<_, 81, _>(|cell| {
        let row = cell / 9;
        let column = cell % 9;
        ((row * 3 + row / 3 + column) % 9 + 1) as u8
    });
    let givens = Board::try_from(values.as_slice()).unwrap();
    let before = BoardLayers {
        entries: Board::EMPTY,
        notes: [CandidateMask::EMPTY; 81],
    };
    let rules = compile_rules(&PuzzleRules::Classic).unwrap();
    let mut budget = WorkBudget::new(0);
    let action = BoardEdit::Enter {
        cell: CellIndex::try_from(0_usize).unwrap(),
        digit: Digit::try_from(9).unwrap(),
    };

    let EditOutcome::Complete(mut result) =
        edit_board(&givens, &before, &action, &rules, &mut budget).unwrap()
    else {
        panic!("A fixed given is a completed no-op");
    };

    assert!(!result.changed);
    assert!(result.board_complete);
    assert_eq!(result.layers, before);
    result.layers.notes[0] = CandidateMask::ALL;
    assert_eq!(before.notes[0], CandidateMask::EMPTY);
    assert_eq!(givens.values(), &values);
}
