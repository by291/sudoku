#[path = "support/logic.rs"]
mod contracts;
#[path = "support/rules.rs"]
pub mod fixtures;
#[path = "support/projection.rs"]
mod logical_projection;

use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};
use sudoku_core::control::{CancellationProbe, ExecutionControl};
use sudoku_core::logic::solver::{analyze_workspace, find_step};
use sudoku_core::logic::techniques::Technique;
use sudoku_core::logic::types::{
    Evidence, LogicStatus, LogicalAction, LogicalWorkspace, Removal, StepOutcome,
};
use sudoku_core::logic::variant_techniques::find_variant_step;
use sudoku_core::logic::workspace::{apply_step, create_workspace};
use sudoku_core::rules::context::compile_rules;
use sudoku_core::rules::types::{Cage, PreparedRules, PuzzleRules, Unit, UnitKind};
use sudoku_core::types::{BOARD_SIZE, Board, Bounded, CandidateMask};

const SUM_THREE_CANDIDATE_BITS: u16 = 0b111;
const SUM_THREE_SUPPORTED_BITS: u16 = 0b011;
const FIRST_SUM_THREE_WITNESS_CHECKS: usize = 4;

#[derive(Debug)]
struct CancelAfterChecks {
    completed_checks: AtomicUsize,
    allowed_checks: usize,
}

impl CancellationProbe for CancelAfterChecks {
    /// Allows the requested checkpoints before asserting a monotonic cancellation signal.
    fn is_cancelled(&self) -> bool {
        self.completed_checks.fetch_add(1, Ordering::Relaxed) >= self.allowed_checks
    }
}

fn sum_three_workspace() -> LogicalWorkspace {
    let mut cages = vec![Cage {
        cells: vec![0, 1],
        sum: 3,
    }];
    cages.extend((2..BOARD_SIZE).map(|cell| Cage {
        cells: vec![cell],
        sum: 1,
    }));
    let rules = compile_rules(&PuzzleRules::Killer { cages }).unwrap();
    workspace_with_sum_three_candidates(&rules)
}

fn workspace_with_sum_three_candidates(rules: &PreparedRules) -> LogicalWorkspace {
    let mut candidates = *create_workspace(&Board::EMPTY, rules).candidates();
    let cage_domain = CandidateMask::try_from(SUM_THREE_CANDIDATE_BITS).unwrap();
    candidates[..2].fill(cage_domain);
    LogicalWorkspace::from_authored_candidates(&Board::EMPTY, candidates, rules).unwrap()
}

fn find_cage_combination(
    state: &mut LogicalWorkspace,
    control: &mut ExecutionControl,
) -> StepOutcome {
    find_variant_step(state, &[Technique::CageCombination], control)
}

#[test]
fn basic_and_variant_steps_match_ordered_evidence() {
    let rules = compile_rules(&PuzzleRules::Classic).unwrap();
    let mut candidates = *create_workspace(&Board::EMPTY, &rules).candidates();
    candidates[0] = CandidateMask::try_from(7).unwrap();
    candidates[1] = CandidateMask::try_from(11).unwrap();
    candidates[2..9].fill(CandidateMask::try_from(508).unwrap());
    let mut state =
        LogicalWorkspace::from_authored_candidates(&Board::EMPTY, candidates, &rules).unwrap();
    let mut control = ExecutionControl::new();

    let Bounded::Complete(Some(step)) =
        find_step(&mut state, &[Technique::HiddenPair], &mut control)
    else {
        panic!("Expected independently known hidden pair");
    };

    assert_eq!(
        step.action,
        LogicalAction::Elimination {
            removals: vec![Removal { cell: 0, digit: 3 }, Removal { cell: 1, digit: 4 }]
        }
    );
    assert_eq!(
        step.evidence,
        Evidence::Unit {
            unit: Unit {
                kind: UnitKind::Row,
                index: 0
            },
            cells: vec![0, 1],
            digits: vec![1, 2],
            premises: vec![],
            units: Some(vec![])
        }
    );

    let mut state = sum_three_workspace();
    let Bounded::Complete(Some(mut first)) =
        find_cage_combination(&mut state, &mut ExecutionControl::new())
    else {
        panic!("Expected distinct sum-three proof");
    };
    assert_eq!(
        first.action,
        LogicalAction::Elimination {
            removals: vec![Removal { cell: 0, digit: 3 }, Removal { cell: 1, digit: 3 }]
        }
    );
    let original = first.clone();
    if let Evidence::Rule(evidence) = &mut first.evidence {
        evidence.cells[0] = 80;
        evidence.digits[0] = 9;
    }
    let repeated = find_cage_combination(&mut state, &mut ExecutionControl::new());
    assert_eq!(repeated, Bounded::Complete(Some(original.clone())));

    apply_step(&mut state, &original).unwrap();
    assert_eq!(state.candidates()[0].bits(), SUM_THREE_SUPPORTED_BITS);
    assert_eq!(state.premises().len(), 1);
}

#[test]
fn cancelled_cage_enumeration_leaves_no_partial_support_for_retry() {
    let mut state = sum_three_workspace();
    let original_candidates = *state.candidates();
    // Allow the detector gate, the first digit and the first two attempts for the second digit.
    // This records (1, 2) before cancellation withholds the reverse witness (2, 1).
    let probe = CancelAfterChecks {
        completed_checks: AtomicUsize::new(0),
        allowed_checks: FIRST_SUM_THREE_WITNESS_CHECKS,
    };
    let mut control = ExecutionControl::with_cancellation(Arc::new(probe));

    assert_eq!(
        find_cage_combination(&mut state, &mut control),
        Bounded::Cancelled
    );
    assert_eq!(state.candidates(), &original_candidates);
    assert!(state.premises().is_empty());

    let Bounded::Complete(Some(step)) =
        find_cage_combination(&mut state, &mut ExecutionControl::new())
    else {
        panic!("Expected a deduction from complete support on retry");
    };

    // The only distinct pairs totaling three are (1, 2) and (2, 1).
    assert_eq!(
        step.action,
        LogicalAction::Elimination {
            removals: vec![Removal { cell: 0, digit: 3 }, Removal { cell: 1, digit: 3 }]
        }
    );
}

#[test]
fn sum_three_deduction_uses_current_candidates() {
    let mut state = sum_three_workspace();
    let Bounded::Complete(Some(step)) =
        find_cage_combination(&mut state, &mut ExecutionControl::new())
    else {
        panic!("Expected complete support");
    };

    let mut first_removal = *step;
    first_removal.action = LogicalAction::Elimination {
        removals: vec![Removal { cell: 0, digit: 3 }],
    };
    apply_step(&mut state, &first_removal).unwrap();
    let Bounded::Complete(Some(step)) =
        find_cage_combination(&mut state, &mut ExecutionControl::new())
    else {
        panic!("Expected remaining deduction");
    };
    assert_eq!(
        step.action,
        LogicalAction::Elimination {
            removals: vec![Removal { cell: 1, digit: 3 }]
        }
    );
}

#[test]
fn new_clue_masks_never_reuse_reduced_domains() {
    let mut first = sum_three_workspace();
    let Bounded::Complete(Some(step)) =
        find_cage_combination(&mut first, &mut ExecutionControl::new())
    else {
        panic!("Expected complete support");
    };
    apply_step(&mut first, &step).unwrap();
    let mut second = workspace_with_sum_three_candidates(first.rules());

    assert_eq!(
        find_cage_combination(&mut second, &mut fixtures::cancelled_control()),
        Bounded::Cancelled
    );
    assert!(second.premises().is_empty());
    let result = analyze_workspace(
        &mut second,
        &[Technique::CageCombination],
        0,
        &mut ExecutionControl::new(),
        &[],
    );
    assert_eq!(result.status, LogicStatus::StepLimit);
    assert!(result.steps.is_empty());
    let result = analyze_workspace(
        &mut second,
        &[Technique::CageCombination],
        500,
        &mut fixtures::cancelled_control(),
        &[],
    );
    assert_eq!(result.status, LogicStatus::Cancelled);
}

#[test]
fn authored_basic_and_variant_traces_match_every_evidence_field() {
    let rows: Vec<serde_json::Value> = serde_json::from_str(include_str!(
        "../../../tests/fixtures/engine-contracts/logic.json"
    ))
    .unwrap();
    for row in rows {
        let advanced = row["expected"]["steps"]
            .as_array()
            .unwrap()
            .iter()
            .any(|step| {
                Technique::parse(step["technique"].as_str().unwrap())
                    .unwrap()
                    .is_advanced()
            });
        if advanced {
            continue;
        }
        let input = serde_json::from_value(row["input"].clone()).unwrap();

        let actual = contracts::evaluate(input).unwrap();

        assert_eq!(
            actual,
            fixtures::without_work(row["expected"].clone()),
            "{}",
            row["id"]
        );
        let solution = &row["input"]["solution"];
        for step in actual["steps"].as_array().unwrap() {
            if step["kind"] == "placement" {
                assert_eq!(
                    step["digit"],
                    solution[step["cell"].as_u64().unwrap() as usize]
                );
            } else {
                for removal in step["removals"].as_array().unwrap() {
                    assert_ne!(
                        removal["digit"],
                        solution[removal["cell"].as_u64().unwrap() as usize]
                    );
                }
            }
        }
    }
}
