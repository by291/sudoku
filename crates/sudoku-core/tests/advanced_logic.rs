#[path = "../examples/contracts/advanced.rs"]
mod advanced_contracts;
#[path = "support/rules.rs"]
pub mod fixtures;
#[path = "../examples/contracts/projection.rs"]
mod logical_projection;

use sudoku_core::budget::WorkBudget;
use sudoku_core::logic::advanced_evidence::validate_advanced_step;
use sudoku_core::logic::advanced_techniques::find_advanced_step;
use sudoku_core::logic::techniques::Technique;
use sudoku_core::logic::types::{AdvancedEvidenceKind, Evidence, LogicalAction, Removal};
use sudoku_core::logic::workspace::create_workspace;
use sudoku_core::rules::context::compile_rules;
use sudoku_core::rules::types::{PuzzleRules, Unit, UnitKind};
use sudoku_core::types::{Board, Bounded, CandidateMask};

#[test]
fn rejects_forged_fish_wing_and_coloring_premises() {
    let cases = [
        (
            Technique::NakedTriple,
            511,
            vec![(0, 3), (1, 6), (2, 5)],
            3,
            1,
        ),
        (
            Technique::HiddenTriple,
            504,
            vec![(0, 11), (1, 14), (2, 13)],
            0,
            4,
        ),
        (
            Technique::XWing,
            510,
            vec![(1, 511), (6, 511), (28, 511), (33, 511), (10, 511)],
            10,
            1,
        ),
        (
            Technique::Swordfish,
            510,
            vec![
                (1, 511),
                (4, 511),
                (31, 511),
                (34, 511),
                (55, 511),
                (61, 511),
                (10, 511),
            ],
            10,
            1,
        ),
        (Technique::XYWing, 511, vec![(0, 3), (4, 5), (27, 6)], 31, 3),
        (
            Technique::SimpleColoring,
            510,
            vec![
                (0, 511),
                (4, 511),
                (40, 511),
                (36, 511),
                (9, 511),
                (18, 511),
            ],
            9,
            1,
        ),
        (
            Technique::SimpleColoring,
            510,
            vec![(0, 511), (1, 511), (10, 511)],
            10,
            1,
        ),
    ];
    let rules = compile_rules(&PuzzleRules::Classic).unwrap();
    for (technique, base, entries, cell, digit) in cases {
        let mut state = create_workspace(&Board::EMPTY, &rules);
        state.candidates = [CandidateMask::try_from(base).unwrap(); 81];
        for (cell, bits) in entries {
            state.candidates[cell] = CandidateMask::try_from(bits).unwrap();
        }

        let Bounded::Complete(Some(step)) =
            find_advanced_step(&state, technique, &mut WorkBudget::new(100000))
        else {
            panic!("Expected authored advanced proof: {technique:?}");
        };

        let LogicalAction::Elimination { removals } = &step.action else {
            panic!("Expected elimination");
        };
        assert!(removals.contains(&Removal { cell, digit }));
        assert!(validate_advanced_step(&state, &step));
        let mut forged = step.clone();
        forged.action = LogicalAction::Elimination {
            removals: vec![Removal { cell: 80, digit: 9 }],
        };
        assert!(!validate_advanced_step(&state, &forged));
        let mut forged = step.clone();
        if let Evidence::Advanced(evidence) = &mut forged.evidence {
            evidence.domains[0].mask = CandidateMask::EMPTY;
        }
        assert!(!validate_advanced_step(&state, &forged));
        let mut forged = step.clone();
        if let Evidence::Advanced(evidence) = &mut forged.evidence {
            match &mut evidence.kind {
                AdvancedEvidenceKind::Subset { unit, .. } => unit.index = 81,
                AdvancedEvidenceKind::Fish { covers, .. } => covers[0].kind = UnitKind::Box,
                AdvancedEvidenceKind::Wing { pivot, .. } => *pivot = 80,
                AdvancedEvidenceKind::Coloring { links, .. } => {
                    links[0].unit = Unit {
                        kind: UnitKind::Box,
                        index: 8,
                    };
                }
            }
        }
        assert!(!validate_advanced_step(&state, &forged));
    }
}

#[test]
fn matches_every_advanced_witness_and_exact_exhaustion_boundary() {
    let rows: Vec<serde_json::Value> = serde_json::from_str(include_str!(
        "../../../tests/fixtures/engine-contracts/advanced.json"
    ))
    .unwrap();
    for row in rows {
        let input = serde_json::from_value(row["input"].clone()).unwrap();

        let actual = advanced_contracts::evaluate(input).unwrap();

        assert_eq!(actual, row["expected"], "{}", row["id"]);
    }
}
