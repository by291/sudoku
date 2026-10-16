#[path = "support/rules.rs"]
pub mod fixtures;

use sudoku_core::generation::variant::{SpatialSymmetry, transform_board, transform_rules};
use sudoku_core::rules::context::compile_rules;
use sudoku_core::rules::types::PuzzleRules;
use sudoku_core::types::Board;

#[test]
fn permitted_transformations_preserve_every_supplied_variant_solution() {
    let geometry: serde_json::Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/engine-contracts/geometry.json"
    ))
    .unwrap();
    for variant in ["diagonal", "jigsaw", "killer", "thermo", "arrow"] {
        let rules = fixtures::decode_rules(&geometry[variant]["rules"]).unwrap();
        let values: Vec<u8> =
            serde_json::from_value(geometry[variant]["solution"].clone()).unwrap();
        let board = Board::try_from(values.as_slice()).unwrap();
        for symmetry in 0..8 {
            let symmetry = SpatialSymmetry::try_from(symmetry).unwrap();
            for complement in [false, true] {
                let transformed = transform_rules(&rules, symmetry, complement);
                if variant == "arrow" && complement {
                    assert!(transformed.is_err());
                    continue;
                }
                let transformed = transformed.unwrap();
                let solution = transform_board(&board, symmetry, None, complement).unwrap();
                let prepared = compile_rules(&transformed).unwrap();

                assert!(sudoku_core::board::is_complete(&solution, &prepared));
            }
        }
    }
}

#[test]
fn rotation_complement_and_direction_have_independent_literal_facts() {
    let rotation = SpatialSymmetry::try_from(1).unwrap();
    let mapping = rotation.cell_map();
    assert_eq!(
        [mapping[0], mapping[8], mapping[72], mapping[80]],
        [8, 80, 0, 72]
    );
    let geometry: serde_json::Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/engine-contracts/geometry.json"
    ))
    .unwrap();
    let rules = fixtures::decode_rules(&geometry["killer"]["rules"]).unwrap();
    let PuzzleRules::Killer { cages } = transform_rules(&rules, rotation, true).unwrap() else {
        panic!("Expected cages");
    };

    // The authored first cage is cells 0,1,2 with total 6; complement changes its total to 30-6.
    assert_eq!(cages[0].cells, vec![8, 17, 26]);
    assert_eq!(cages[0].sum, 24);
    let thermo = PuzzleRules::Thermo {
        paths: vec![vec![0, 1, 2]],
    };
    let transformed = transform_rules(&thermo, rotation, true).unwrap();
    assert_eq!(
        transformed,
        PuzzleRules::Thermo {
            paths: vec![vec![26, 17, 8]]
        }
    );
    assert!(SpatialSymmetry::try_from(8).is_err());
    assert!(transform_board(&Board::EMPTY, rotation, Some(&[1; 9]), false).is_err());
}
