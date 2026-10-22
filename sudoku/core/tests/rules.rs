#[path = "support/rules.rs"]
pub mod fixtures;

use sudoku_core::board::{base_candidates, is_complete};
use sudoku_core::control::ExecutionControl;
use sudoku_core::rules::context::{compile_rules, prepare_rules};
use sudoku_core::rules::types::{Arrow, Cage, PuzzleRules, UnitKind};
use sudoku_core::types::{Board, Bounded};

#[test]
fn matches_all_ordered_topology_contracts() {
    let rows: Vec<serde_json::Value> = serde_json::from_str(include_str!(
        "../../../tests/fixtures/engine-contracts/rules.json"
    ))
    .unwrap();

    for row in rows {
        let rules = fixtures::decode_rules(&row["input"]["rules"]).unwrap();
        let values: Vec<u8> = serde_json::from_value(row["input"]["board"].clone()).unwrap();
        let board = Board::try_from(values.as_slice()).unwrap();
        let prepared = compile_rules(&rules).unwrap();
        let candidates: Vec<u16> = base_candidates(&board, &prepared)
            .iter()
            .map(|mask| mask.bits())
            .collect();

        assert_eq!(
            fixtures::project_rules(&prepared),
            row["expected"]["context"],
            "{}",
            row["id"]
        );
        assert_eq!(serde_json::json!(candidates), row["expected"]["candidates"]);
        assert_eq!(
            serde_json::json!(is_complete(&board, &prepared)),
            row["expected"]["complete"]
        );
    }
}

#[test]
fn arrow_relation_is_not_a_duplicate_peer() {
    let rules = PuzzleRules::Arrow {
        arrows: vec![Arrow {
            circle: 2,
            shaft: vec![12, 22, 32],
        }],
    };

    let prepared = compile_rules(&rules).unwrap();
    let metadata = prepared.metadata();

    assert!(metadata.related_cells[12].contains(&32));
    assert!(!metadata.duplicate_peers[12].contains(&32));
    assert_eq!(metadata.units.len(), 27);
}

#[test]
fn jigsaw_replaces_boxes() {
    let regions = (0..9)
        .map(|column| (0..9).map(|row| row * 9 + column).collect())
        .collect();
    let rules = PuzzleRules::Jigsaw { regions };

    let prepared = compile_rules(&rules).unwrap();
    let metadata = prepared.metadata();

    assert_eq!(metadata.units.len(), 27);
    assert_eq!(
        metadata
            .units
            .iter()
            .filter(|unit| unit.kind == UnitKind::Region)
            .count(),
        9
    );
    assert!(!metadata.units.iter().any(|unit| unit.kind == UnitKind::Box));
    assert!(!metadata.duplicate_peers[0].contains(&10));
}

#[test]
fn malformed_geometry_and_sums_are_rejected() {
    let cages = (0..9)
        .map(|row| Cage {
            cells: (0..9).map(|column| row * 9 + column).collect(),
            sum: 44,
        })
        .collect();
    let invalid = [
        PuzzleRules::Jigsaw {
            regions: vec![vec![0; 9]; 9],
        },
        PuzzleRules::Killer { cages },
        PuzzleRules::Thermo {
            paths: vec![vec![0, 80]],
        },
        PuzzleRules::Thermo {
            paths: vec![vec![0, 0]],
        },
        PuzzleRules::Arrow {
            arrows: vec![Arrow {
                circle: 81,
                shaft: vec![0],
            }],
        },
        PuzzleRules::Arrow {
            arrows: vec![Arrow {
                circle: 0,
                shaft: vec![0, 1],
            }],
        },
    ];

    for rules in invalid {
        assert!(compile_rules(&rules).is_err());
    }
}

#[test]
fn cancelled_preparation_never_exposes_partial_geometry() {
    let mut empty = ExecutionControl::new();
    assert!(matches!(
        prepare_rules(&PuzzleRules::Classic, &mut empty).unwrap(),
        Bounded::Complete(_)
    ));

    let mut short = fixtures::cancelled_control();
    assert!(matches!(
        prepare_rules(&PuzzleRules::Diagonal, &mut short).unwrap(),
        Bounded::Cancelled
    ));

    let mut complete = ExecutionControl::new();
    assert!(matches!(
        prepare_rules(&PuzzleRules::Diagonal, &mut complete).unwrap(),
        Bounded::Complete(_)
    ));
}

#[test]
fn caller_and_returned_metadata_mutations_cannot_change_prepared_rules() {
    let mut rules = PuzzleRules::Arrow {
        arrows: vec![Arrow {
            circle: 2,
            shaft: vec![12, 22, 32],
        }],
    };
    let prepared = compile_rules(&rules).unwrap();
    let original = prepared.metadata();
    if let PuzzleRules::Arrow { arrows } = &mut rules {
        arrows[0].shaft.clear();
    }
    let mut returned = prepared.metadata();
    returned.units.clear();
    returned.duplicate_peers[0].clear();

    assert_eq!(prepared.metadata(), original);
}
