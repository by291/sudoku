use sudoku_core::control::ExecutionControl;
use sudoku_core::logic::solver::find_step;
use sudoku_core::logic::teaching::validate_teaching_step;
use sudoku_core::logic::techniques::Technique;
use sudoku_core::logic::types::LogicalWorkspace;
use sudoku_core::logic::types::{Evidence, LogicalAction, LogicalStep, Removal};
use sudoku_core::rules::context::compile_rules;
use sudoku_core::rules::types::{PuzzleRules, Unit, UnitKind};
use sudoku_core::types::{Board, Bounded, CandidateMask};

fn unit_step(
    technique: Technique,
    action: LogicalAction,
    cells: Vec<usize>,
    digits: Vec<u8>,
    row: usize,
) -> LogicalStep {
    LogicalStep {
        technique,
        action,
        evidence: Evidence::Unit {
            unit: Unit {
                kind: UnitKind::Row,
                index: row,
            },
            cells,
            digits,
            premises: vec![],
            units: None,
        },
    }
}

#[test]
fn accepts_an_authored_single_independently_of_detector_order() {
    let rules = compile_rules(&PuzzleRules::Classic).unwrap();
    let mut candidates = [CandidateMask::ALL; 81];
    candidates[1..9].fill(CandidateMask::try_from(511 ^ 16).unwrap());
    candidates[10..18].fill(CandidateMask::try_from(511 ^ 32).unwrap());
    let mut state =
        LogicalWorkspace::from_authored_candidates(&Board::EMPTY, candidates, &rules).unwrap();
    let step = unit_step(
        Technique::HiddenSingle,
        LogicalAction::Placement { cell: 9, digit: 6 },
        vec![9],
        vec![6],
        1,
    );

    let Bounded::Complete(Some(first)) = find_step(
        &mut state,
        &[Technique::HiddenSingle],
        &mut ExecutionControl::new(),
    ) else {
        panic!("Missing independent first pattern")
    };

    assert_eq!(first.action, LogicalAction::Placement { cell: 0, digit: 5 });
    assert!(
        validate_teaching_step(
            state.board(),
            *state.candidates(),
            &PuzzleRules::Classic,
            &step
        )
        .is_ok()
    );
    let forged = unit_step(
        Technique::HiddenSingle,
        LogicalAction::Placement { cell: 9, digit: 7 },
        vec![9],
        vec![7],
        1,
    );
    assert!(
        validate_teaching_step(
            state.board(),
            *state.candidates(),
            &PuzzleRules::Classic,
            &forged
        )
        .is_err()
    );
}

#[test]
fn checks_each_authored_pair_removal_against_its_candidate_state() {
    let mut candidates = [CandidateMask::ALL; 81];
    candidates[0] = CandidateMask::try_from(3).unwrap();
    candidates[1] = CandidateMask::try_from(3).unwrap();
    let valid = unit_step(
        Technique::NakedPair,
        LogicalAction::Elimination {
            removals: vec![Removal { cell: 2, digit: 1 }],
        },
        vec![0, 1],
        vec![1, 2],
        0,
    );
    let forged = unit_step(
        Technique::NakedPair,
        LogicalAction::Elimination {
            removals: vec![Removal { cell: 2, digit: 3 }],
        },
        vec![0, 1],
        vec![1, 2],
        0,
    );

    assert!(
        validate_teaching_step(&Board::EMPTY, candidates, &PuzzleRules::Classic, &valid).is_ok()
    );
    assert!(
        validate_teaching_step(&Board::EMPTY, candidates, &PuzzleRules::Classic, &forged).is_err()
    );
}
