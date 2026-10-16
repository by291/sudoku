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
