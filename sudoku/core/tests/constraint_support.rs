#[path = "support/rules.rs"]
pub mod fixtures;

use sudoku_core::constraints::support::prepare_constraint_support;
use sudoku_core::constraints::types::{CatalogueLimits, SupportResult};
use sudoku_core::control::ExecutionControl;
use sudoku_core::rules::context::compile_rules;
use sudoku_core::types::{Board, Bounded, CandidateMask};

#[test]
fn catalogue_overflow_discards_partial_support() {
    compare_support_fixtures("pair:");
    compare_support_fixtures("quad:");
}

#[test]
fn large_cages_use_bounded_fallback() {
    compare_support_fixtures("large:");
    compare_support_fixtures("arrow-repeat:");
}

#[test]
fn prepared_support_preserves_independent_domain_profiles() {
    compare_support_fixtures("thermo:");
    compare_support_fixtures("triple:");
    compare_support_fixtures("domain-profile:");
}

fn compare_support_fixtures(prefix: &str) {
    let rows: Vec<serde_json::Value> = serde_json::from_str(include_str!(
        "../../../tests/fixtures/engine-contracts/support.json"
    ))
    .unwrap();
    for row in rows
        .iter()
        .filter(|row| row["id"].as_str().unwrap().starts_with(prefix))
    {
        let input = &row["input"];
        let rules = fixtures::decode_rules(&input["rules"]).unwrap();
        let context = compile_rules(&rules).unwrap();
        let values: Vec<u8> = serde_json::from_value(input["board"].clone()).unwrap();
        let board = Board::try_from(values.as_slice()).unwrap();
        let masks: Vec<u16> = serde_json::from_value(input["domains"].clone()).unwrap();
        let domains: [CandidateMask; 81] =
            std::array::from_fn(|index| CandidateMask::try_from(masks[index]).unwrap());
        let limits = CatalogueLimits {
            max_tuples_per_constraint: input["limits"]["maxTuplesPerConstraint"].as_u64().unwrap()
                as usize,
            max_tuples_per_layout: input["limits"]["maxTuplesPerLayout"].as_u64().unwrap() as usize,
        };
        let mut preparation = ExecutionControl::new();
        let Bounded::Complete(prepared) =
            prepare_constraint_support(&context, &mut preparation, limits).unwrap()
        else {
            panic!("Expected complete preparation");
        };
        let mut control = ExecutionControl::new();
        let result = prepared.get(&board, &domains, 0, &mut control).unwrap();
        let value = match result {
            SupportResult::Complete(snapshot) => {
                serde_json::json!({"status":"complete","cells":snapshot.cells,"supports":snapshot.supports.iter().map(|mask| mask.bits()).collect::<Vec<_>>()})
            }
            SupportResult::Cancelled => serde_json::json!({"status":"budget-exhausted"}),
        };

        if row["expected"]["result"]["status"] == "complete" {
            assert_eq!(value, row["expected"]["result"], "{}", row["id"]);
        }
    }
}

#[test]
fn catalogue_limits_cannot_exceed_fixed_memory_bounds() {
    let context = compile_rules(&sudoku_core::rules::types::PuzzleRules::Classic).unwrap();
    for limits in [
        CatalogueLimits {
            max_tuples_per_constraint: 513,
            max_tuples_per_layout: 8192,
        },
        CatalogueLimits {
            max_tuples_per_constraint: 512,
            max_tuples_per_layout: 8193,
        },
    ] {
        let mut control = ExecutionControl::new();

        assert!(prepare_constraint_support(&context, &mut control, limits).is_err());
    }
}

#[test]
fn ten_cell_arrow_keeps_its_full_arity_and_repeat_rejection() {
    use sudoku_core::constraints::support::get_constraint_support;
    use sudoku_core::rules::types::{Arrow, PuzzleRules};

    let rules = PuzzleRules::Arrow {
        arrows: vec![Arrow {
            circle: 0,
            shaft: vec![1, 2, 3, 4, 5, 6, 7, 8, 17],
        }],
    };
    let context = compile_rules(&rules).unwrap();
    let mut domains = [CandidateMask::EMPTY; 81];
    domains[0] = CandidateMask::try_from(1 << 8).unwrap();
    for cell in [1, 2, 3, 4, 5, 6, 7, 8, 17] {
        domains[cell] = CandidateMask::try_from(1).unwrap();
    }
    let mut control = ExecutionControl::new();

    let Bounded::Complete(result) =
        get_constraint_support(&Board::EMPTY, &domains, &context, 0, &mut control).unwrap()
    else {
        panic!("The impossible repeat is established in exactly three candidate visits");
    };

    // Nine shaft digits must all be one to total at most nine; the first two share a row.
    assert_eq!(result.cells, [0, 1, 2, 3, 4, 5, 6, 7, 8, 17]);
    assert_eq!(result.supports, [CandidateMask::EMPTY; 10]);

    assert!(matches!(
        get_constraint_support(
            &Board::EMPTY,
            &domains,
            &context,
            0,
            &mut fixtures::cancelled_control()
        )
        .unwrap(),
        Bounded::Cancelled
    ));
}

#[test]
fn empty_support_domains_preserve_raw_and_fallback_results() {
    use sudoku_core::constraints::support::get_constraint_support;
    use sudoku_core::constraints::types::SupportSnapshot;
    use sudoku_core::rules::types::{Arrow, Cage, PuzzleRules};

    let mut cages = vec![Cage {
        cells: vec![0, 1],
        sum: 3,
    }];
    cages.extend((2..81).map(|cell| Cage {
        cells: vec![cell],
        sum: 1,
    }));
    let variants = [
        PuzzleRules::Killer { cages },
        PuzzleRules::Arrow {
            arrows: vec![Arrow {
                circle: 0,
                shaft: vec![1],
            }],
        },
    ];

    for rules in variants {
        let context = compile_rules(&rules).unwrap();
        let mut preparation = ExecutionControl::new();
        let Bounded::Complete(prepared) = prepare_constraint_support(
            &context,
            &mut preparation,
            CatalogueLimits {
                max_tuples_per_constraint: 0,
                max_tuples_per_layout: 0,
            },
        )
        .unwrap() else {
            panic!("Expected forced enumeration preparation");
        };

        for first_domain_empty in [false, true] {
            let mut domains = [CandidateMask::EMPTY; 81];
            domains[if first_domain_empty { 1 } else { 0 }] = CandidateMask::try_from(1).unwrap();

            for owner in [None, Some(&prepared)] {
                for cancelled in [false, true] {
                    let mut control = if cancelled {
                        fixtures::cancelled_control()
                    } else {
                        ExecutionControl::new()
                    };

                    let result = match owner {
                        Some(owner) => owner.get(&Board::EMPTY, &domains, 0, &mut control).unwrap(),
                        None => get_constraint_support(
                            &Board::EMPTY,
                            &domains,
                            &context,
                            0,
                            &mut control,
                        )
                        .unwrap(),
                    };

                    // A future empty domain rejects after trying digit one; an empty first domain tries nothing.
                    let expected = if first_domain_empty || !cancelled {
                        Bounded::Complete(SupportSnapshot {
                            cells: vec![0, 1],
                            supports: vec![CandidateMask::EMPTY; 2],
                        })
                    } else {
                        Bounded::Cancelled
                    };
                    assert_eq!(
                        result, expected,
                        "{rules:?}, first empty: {first_domain_empty}"
                    );
                }
            }
        }
    }
}

#[test]
fn wide_cage_support_keeps_only_compatible_tuple_digits() {
    use sudoku_core::rules::types::{Cage, PuzzleRules};

    let mut cages = vec![Cage {
        cells: vec![0, 1, 2, 3],
        sum: 20,
    }];
    cages.extend((4..81).map(|cell| Cage {
        cells: vec![cell],
        sum: 1,
    }));
    let rules = compile_rules(&PuzzleRules::Killer { cages }).unwrap();
    let Bounded::Complete(prepared) = prepare_constraint_support(
        &rules,
        &mut ExecutionControl::new(),
        CatalogueLimits::default(),
    )
    .unwrap() else {
        panic!("Expected complete catalogue");
    };
    let mut domains = [CandidateMask::ALL; 81];
    domains[0] = CandidateMask::try_from(1).unwrap();

    let Bounded::Complete(result) = prepared
        .get(&Board::EMPTY, &domains, 0, &mut ExecutionControl::new())
        .unwrap()
    else {
        panic!("Expected complete support");
    };

    // With the first digit fixed to one, every digit 2..9 occurs in a distinct triple totaling 19.
    assert_eq!(
        result
            .supports
            .iter()
            .map(|mask| mask.bits())
            .collect::<Vec<_>>(),
        [1, 510, 510, 510]
    );
    domains[1] = CandidateMask::try_from(1).unwrap();
    let Bounded::Complete(impossible) = prepared
        .get(&Board::EMPTY, &domains, 0, &mut ExecutionControl::new())
        .unwrap()
    else {
        panic!("Expected complete contradiction");
    };
    assert_eq!(impossible.supports, [CandidateMask::EMPTY; 4]);
}

#[test]
fn increasing_path_support_retains_feasible_gaps_and_rejects_reversed_domains() {
    use sudoku_core::constraints::support::get_constraint_support;
    use sudoku_core::rules::types::PuzzleRules;

    let rules = compile_rules(&PuzzleRules::Thermo {
        paths: vec![vec![0, 1, 2]],
    })
    .unwrap();
    for (input, expected) in [
        ([18, 37, 72], [18, 36, 72]), // {2,5}, {1,3,6}, {4,7}: only the middle one is impossible.
        ([16, 4, 64], [0, 0, 0]),     // Five cannot precede three.
        ([2, 4, 8], [2, 4, 8]),
        ([0, 511, 511], [0, 0, 0]),
    ] {
        let mut domains = [CandidateMask::ALL; 81];
        for (cell, mask) in input.into_iter().enumerate() {
            domains[cell] = CandidateMask::try_from(mask).unwrap();
        }
        let Bounded::Complete(result) = get_constraint_support(
            &Board::EMPTY,
            &domains,
            &rules,
            0,
            &mut ExecutionControl::new(),
        )
        .unwrap() else {
            panic!("Expected complete path support");
        };

        assert_eq!(
            result
                .supports
                .iter()
                .map(|mask| mask.bits())
                .collect::<Vec<_>>(),
            expected
        );
    }
}
