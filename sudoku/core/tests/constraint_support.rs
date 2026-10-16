#[path = "support/rules.rs"]
pub mod fixtures;

use sudoku_core::budget::WorkBudget;
use sudoku_core::constraints::support::prepare_constraint_support;
use sudoku_core::constraints::types::{CatalogueLimits, SupportResult};
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
fn last_work_unit_cannot_publish_incomplete_support() {
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
        let mut preparation = WorkBudget::new(input["prepareLimit"].as_u64().unwrap());
        let Bounded::Complete(prepared) =
            prepare_constraint_support(&context, &mut preparation, limits).unwrap()
        else {
            panic!("Expected complete preparation");
        };
        let mut budget = WorkBudget::new(input["queryLimit"].as_u64().unwrap());
        let result = prepared.get(&board, &domains, 0, &mut budget).unwrap();
        if matches!(result, SupportResult::Complete(_)) && budget.used() > 0 {
            let mut almost = WorkBudget::new(budget.used() - 1);
            assert!(
                matches!(
                    prepared.get(&board, &domains, 0, &mut almost).unwrap(),
                    SupportResult::BudgetExhausted
                ),
                "{}",
                row["id"]
            );
        }
        if preparation.used() > 0 {
            let mut almost = WorkBudget::new(preparation.used() - 1);
            assert!(
                matches!(
                    prepare_constraint_support(&context, &mut almost, limits).unwrap(),
                    Bounded::BudgetExhausted
                ),
                "{}",
                row["id"]
            );
        }
        let value = match result {
            SupportResult::Complete(snapshot) => {
                serde_json::json!({"status":"complete","cells":snapshot.cells,"supports":snapshot.supports.iter().map(|mask| mask.bits()).collect::<Vec<_>>()})
            }
            SupportResult::BudgetExhausted => serde_json::json!({"status":"budget-exhausted"}),
        };

        assert_eq!(
            serde_json::json!({"result":value,"prepareWork":preparation.used(),"queryWork":budget.used()}),
            row["expected"],
            "{}",
            row["id"]
        );
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
        let mut budget = WorkBudget::new(100000);

        assert!(prepare_constraint_support(&context, &mut budget, limits).is_err());
        assert_eq!(budget.used(), 0);
    }
}

#[test]
fn ten_cell_arrow_keeps_its_full_arity_and_charged_repeat_rejection() {
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
    let mut budget = WorkBudget::new(3);

    let Bounded::Complete(result) =
        get_constraint_support(&Board::EMPTY, &domains, &context, 0, &mut budget).unwrap()
    else {
        panic!("The impossible repeat is established in exactly three candidate visits");
    };

    // Nine shaft digits must all be one to total at most nine; the first two share a row.
    assert_eq!(result.cells, [0, 1, 2, 3, 4, 5, 6, 7, 8, 17]);
    assert_eq!(result.supports, [CandidateMask::EMPTY; 10]);
    assert_eq!(budget.used(), 3);
    assert!(matches!(
        get_constraint_support(
            &Board::EMPTY,
            &domains,
            &context,
            0,
            &mut WorkBudget::new(2)
        )
        .unwrap(),
        Bounded::BudgetExhausted
    ));
}

#[test]
fn empty_support_domains_preserve_raw_and_fallback_candidate_charges() {
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
        let mut preparation = WorkBudget::new(4_000_000);
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
                for allowance in [0, 1] {
                    let mut budget = WorkBudget::new(allowance);

                    let result = match owner {
                        Some(owner) => owner.get(&Board::EMPTY, &domains, 0, &mut budget).unwrap(),
                        None => get_constraint_support(
                            &Board::EMPTY,
                            &domains,
                            &context,
                            0,
                            &mut budget,
                        )
                        .unwrap(),
                    };

                    // A future empty domain rejects after trying digit one; an empty first domain tries nothing.
                    let expected = if first_domain_empty || allowance == 1 {
                        Bounded::Complete(SupportSnapshot {
                            cells: vec![0, 1],
                            supports: vec![CandidateMask::EMPTY; 2],
                        })
                    } else {
                        Bounded::BudgetExhausted
                    };
                    assert_eq!(
                        result, expected,
                        "{rules:?}, first empty: {first_domain_empty}"
                    );
                    assert_eq!(
                        budget.used(),
                        if first_domain_empty { 0 } else { allowance }
                    );
                }
            }
        }
    }
}
