#[path = "support/logic.rs"]
mod contracts;
#[path = "support/rules.rs"]
pub mod fixtures;
#[path = "support/projection.rs"]
mod logical_projection;

use sudoku_core::budget::WorkBudget;
use sudoku_core::logic::solver::{analyze_workspace, find_step};
use sudoku_core::logic::techniques::Technique;
use sudoku_core::logic::types::{Evidence, LogicStatus, LogicalAction, LogicalWorkspace, Removal};
use sudoku_core::logic::variant_techniques::find_variant_step;
use sudoku_core::logic::workspace::{apply_step, create_workspace};
use sudoku_core::rules::context::compile_rules;
use sudoku_core::rules::types::{Cage, PuzzleRules, Unit, UnitKind};
use sudoku_core::types::{Board, Bounded, CandidateMask};

fn sum_three_workspace() -> sudoku_core::logic::types::LogicalWorkspace {
    let mut cages = vec![Cage {
        cells: vec![0, 1],
        sum: 3,
    }];
    cages.extend((2..81).map(|cell| Cage {
        cells: vec![cell],
        sum: 1,
    }));
    let rules = compile_rules(&PuzzleRules::Killer { cages }).unwrap();
    let mut candidates = *create_workspace(&Board::EMPTY, &rules).candidates();
    candidates[0] = CandidateMask::try_from(7).unwrap();
    candidates[1] = CandidateMask::try_from(7).unwrap();
    LogicalWorkspace::from_authored_candidates(&Board::EMPTY, candidates, &rules).unwrap()
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
    let mut budget = WorkBudget::new(1);

    let Bounded::Complete(Some(step)) =
        find_step(&mut state, &[Technique::HiddenPair], &mut budget)
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
    assert_eq!(budget.used(), 1);

    let mut state = sum_three_workspace();
    let Bounded::Complete(Some(mut first)) = find_variant_step(
        &mut state,
        &[Technique::CageCombination],
        &mut WorkBudget::new(100),
    ) else {
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
    let repeated = find_variant_step(
        &mut state,
        &[Technique::CageCombination],
        &mut WorkBudget::new(1),
    );
    assert_eq!(repeated, Bounded::Complete(Some(original.clone())));

    apply_step(&mut state, &original).unwrap();
    assert_eq!(state.candidates()[0].bits(), 3);
    assert_eq!(state.premises().len(), 1);
}

#[test]
fn incomplete_support_is_never_memoized() {
    let mut state = sum_three_workspace();

    assert_eq!(
        find_variant_step(
            &mut state,
            &[Technique::CageCombination],
            &mut WorkBudget::new(2)
        ),
        Bounded::BudgetExhausted
    );
    assert_eq!(
        find_variant_step(
            &mut state,
            &[Technique::CageCombination],
            &mut WorkBudget::new(1)
        ),
        Bounded::BudgetExhausted
    );
    let Bounded::Complete(Some(step)) = find_variant_step(
        &mut state,
        &[Technique::CageCombination],
        &mut WorkBudget::new(100),
    ) else {
        panic!("Expected complete support");
    };
    // The sum-three cage independently excludes 3. Applying one supported removal must
    // invalidate the memo by its domain key, without discarding prior explained premises.
    let mut narrowed = (*step).clone();
    narrowed.action = LogicalAction::Elimination {
        removals: vec![Removal { cell: 0, digit: 3 }],
    };
    apply_step(&mut state, &narrowed).unwrap();
    let mut budget = WorkBudget::new(100);
    let Bounded::Complete(Some(step)) =
        find_variant_step(&mut state, &[Technique::CageCombination], &mut budget)
    else {
        panic!("Expected recomputed support");
    };
    assert_eq!(
        step.action,
        LogicalAction::Elimination {
            removals: vec![Removal { cell: 1, digit: 3 }]
        }
    );
    assert!(budget.used() > 1);
}

#[test]
fn new_clue_masks_never_reuse_reduced_domains() {
    let mut first = sum_three_workspace();
    let Bounded::Complete(Some(step)) = find_variant_step(
        &mut first,
        &[Technique::CageCombination],
        &mut WorkBudget::new(100),
    ) else {
        panic!("Expected complete support");
    };
    apply_step(&mut first, &step).unwrap();
    let mut candidates = *create_workspace(&Board::EMPTY, first.rules()).candidates();
    candidates[0] = CandidateMask::try_from(7).unwrap();
    candidates[1] = CandidateMask::try_from(7).unwrap();

    let mut second =
        LogicalWorkspace::from_authored_candidates(&Board::EMPTY, candidates, first.rules())
            .unwrap();

    assert_eq!(
        find_variant_step(
            &mut second,
            &[Technique::CageCombination],
            &mut WorkBudget::new(1)
        ),
        Bounded::BudgetExhausted
    );
    assert!(second.premises().is_empty());
    let result = analyze_workspace(
        &mut second,
        &[Technique::CageCombination],
        0,
        &mut WorkBudget::new(100),
        &[],
    );
    assert_eq!(result.status, LogicStatus::StepLimit);
    assert!(result.steps.is_empty());
    let result = analyze_workspace(
        &mut second,
        &[Technique::CageCombination],
        500,
        &mut WorkBudget::new(0),
        &[],
    );
    assert_eq!(result.status, LogicStatus::WorkLimit);
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

        assert_eq!(actual, row["expected"], "{}", row["id"]);
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
