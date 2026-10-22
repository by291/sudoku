use sudoku_core::logic::techniques::Technique;
use sudoku_core::logic::types::{Evidence, LogicalAction, LogicalStep, LogicalWorkspace, Removal};
use sudoku_core::logic::workspace::{apply_step, create_workspace};
use sudoku_core::rules::context::compile_rules;
use sudoku_core::rules::types::{PuzzleRules, Unit, UnitKind};
use sudoku_core::types::{Board, CandidateMask};

fn step(action: LogicalAction) -> LogicalStep {
    LogicalStep {
        technique: Technique::NakedSingle,
        action,
        evidence: Evidence::Unit {
            unit: Unit {
                kind: UnitKind::Row,
                index: 0,
            },
            cells: vec![0],
            digits: vec![1],
            premises: vec![],
            units: None,
        },
    }
}

#[test]
fn malformed_actions_leave_board_candidates_and_premises_unchanged() {
    let rules = compile_rules(&PuzzleRules::Classic).unwrap();
    let mut values = [0; 81];
    values[0] = 1;
    let board = Board::try_from(values.as_slice()).unwrap();
    let actions = [
        LogicalAction::Placement { cell: 81, digit: 2 },
        LogicalAction::Placement { cell: 1, digit: 0 },
        LogicalAction::Placement { cell: 1, digit: 10 },
        LogicalAction::Placement { cell: 0, digit: 2 },
        LogicalAction::Placement { cell: 1, digit: 1 },
        LogicalAction::Elimination { removals: vec![] },
        LogicalAction::Elimination {
            removals: vec![
                Removal { cell: 1, digit: 2 },
                Removal { cell: 81, digit: 3 },
            ],
        },
        LogicalAction::Elimination {
            removals: vec![Removal { cell: 1, digit: 2 }, Removal { cell: 2, digit: 0 }],
        },
        LogicalAction::Elimination {
            removals: vec![
                Removal { cell: 1, digit: 2 },
                Removal { cell: 2, digit: 10 },
            ],
        },
        LogicalAction::Elimination {
            removals: vec![Removal { cell: 1, digit: 2 }, Removal { cell: 0, digit: 1 }],
        },
        LogicalAction::Elimination {
            removals: vec![Removal { cell: 1, digit: 2 }, Removal { cell: 2, digit: 1 }],
        },
    ];
    for action in actions {
        let mut state = create_workspace(&board, &rules);
        let before = *state.candidates();

        let result = apply_step(&mut state, &step(action.clone()));

        assert!(result.is_err(), "Accepted {action:?}");
        assert_eq!(state.board(), &board);
        assert_eq!(state.candidates(), &before);
        assert!(state.premises().is_empty());
    }
}

#[test]
fn authored_candidates_reject_filled_cells_and_reintroduced_peer_digits() {
    let rules = compile_rules(&PuzzleRules::Classic).unwrap();
    let mut values = [0; 81];
    values[0] = 1;
    let board = Board::try_from(values.as_slice()).unwrap();
    let candidates = *create_workspace(&board, &rules).candidates();
    let mut filled = candidates;
    filled[0] = CandidateMask::ALL;
    let mut reintroduced = candidates;
    reintroduced[1] = CandidateMask::ALL;

    assert!(LogicalWorkspace::from_authored_candidates(&board, filled, &rules).is_err());
    assert!(LogicalWorkspace::from_authored_candidates(&board, reintroduced, &rules).is_err());
}

#[test]
fn authored_candidates_own_reduced_and_empty_domains_without_claiming_a_proof() {
    let rules = compile_rules(&PuzzleRules::Classic).unwrap();
    let mut candidates = [CandidateMask::ALL; 81];
    candidates[0] = CandidateMask::EMPTY;
    candidates[1] = CandidateMask::try_from(3).unwrap();

    let state =
        LogicalWorkspace::from_authored_candidates(&Board::EMPTY, candidates, &rules).unwrap();
    candidates[1] = CandidateMask::ALL;

    assert_eq!(candidates[1], CandidateMask::ALL);
    assert_eq!(state.candidates()[0], CandidateMask::EMPTY);
    assert_eq!(state.candidates()[1].bits(), 3);
    assert!(state.premises().is_empty());
}

#[test]
fn detectors_observe_eliminations_and_placements_without_leaking_to_another_workspace() {
    use sudoku_core::logic::basic_techniques::find_basic_step;

    let rules = compile_rules(&PuzzleRules::Classic).unwrap();
    let mut candidates = [CandidateMask::ALL; 81];
    for candidate in &mut candidates[2..9] {
        *candidate = CandidateMask::try_from(510).unwrap();
    }
    let mut workspace =
        LogicalWorkspace::from_authored_candidates(&Board::EMPTY, candidates, &rules).unwrap();
    let other =
        LogicalWorkspace::from_authored_candidates(&Board::EMPTY, candidates, &rules).unwrap();
    assert!(find_basic_step(&workspace, Technique::HiddenSingle).is_none());

    apply_step(
        &mut workspace,
        &step(LogicalAction::Elimination {
            removals: vec![Removal { cell: 1, digit: 1 }],
        }),
    )
    .unwrap();
    let single = find_basic_step(&workspace, Technique::HiddenSingle).unwrap();

    assert_eq!(
        single.action,
        LogicalAction::Placement { cell: 0, digit: 1 }
    );
    assert!(find_basic_step(&other, Technique::HiddenSingle).is_none());

    apply_step(&mut workspace, &single).unwrap();

    assert!(find_basic_step(&workspace, Technique::HiddenSingle).is_none());
    assert_eq!(workspace.board().values()[0], 1);
}
