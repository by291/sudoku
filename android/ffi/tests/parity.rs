use std::sync::Arc;
use sudoku_ffi::*;

fn token() -> Arc<CancellationToken> {
    Arc::new(CancellationToken::new())
}

#[test]
fn all_nineteen_combinations_reuse_the_sealed_independent_generation_evidence() {
    // These literal expectations were copied from the existing sealed TypeScript oracle corpus.
    // Adapter equality reuses that independent evidence; it is not a new mathematical proof.
    let corpus: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/generation-parity.json")).unwrap();
    let cases = corpus["cases"].as_array().unwrap();
    assert_eq!(cases.len(), 19);
    for row in cases {
        let mut options = row["input"].clone();
        let seed = serde_json::from_value(options.as_object_mut().unwrap().remove("seed").unwrap())
            .unwrap();
        let options: GenerationOptionsDto = serde_json::from_value(options).unwrap();
        let result = generate(seed, options, token()).unwrap();
        assert_eq!(
            serde_json::to_value(result).unwrap(),
            row["expected"],
            "{}",
            row["id"]
        );
    }
}

#[test]
fn exact_search_retains_independent_counts_nodes_and_work() {
    let rows: Vec<serde_json::Value> = serde_json::from_str(include_str!(
        "../../../tests/fixtures/engine-contracts/exact-prepared.json"
    ))
    .unwrap();
    for row in rows {
        let input = &row["input"];
        let rules = serde_json::from_value(input["rules"].clone()).unwrap();
        let prepared = prepare_puzzle(
            PrepareInputDto {
                rules,
                max_work: None,
            },
            token(),
        )
        .unwrap();
        let result = prepared
            .count_solutions(
                PreparedCountInputDto {
                    board: serde_json::from_value(input["board"].clone()).unwrap(),
                    work: Some(SearchOptionsDto {
                        max_work: Some(input["workLimit"].as_u64().unwrap() as u32),
                        initial_work: Some(input["initialWork"].as_u64().unwrap() as u32),
                        node_limit: Some(input["nodeLimit"].as_u64().unwrap() as u32),
                    }),
                },
                token(),
            )
            .unwrap();
        assert_eq!(
            serde_json::json!({"result":result.result,"used":result.work_used}),
            row["expected"],
            "{}",
            row["id"]
        );
    }
}
