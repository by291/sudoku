use serde::Deserialize;
use std::{env, fs};
use sudoku_core_benchmark::{PreparedContext, SearchResult, Topology, calculate_candidates};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Case {
    id: String,
    board: Vec<u8>,
    topology: Topology,
    expected_candidates: Vec<u16>,
    probes: Vec<Probe>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Probe {
    node_limit: u64,
    work_limit: u64,
    initial_work: u64,
    expected: SearchResult,
}

// The independent reference solver checks solution counts before this corpus is written.
// Production TypeScript additionally supplies traversal/work contracts for the port.
#[test]
fn matches_reference_checked_boards_and_typescript_budget_contracts() {
    let corpus_path =
        env::var("SUDOKU_BENCH_CORPUS").expect("Generate the corpus with run.mjs first");
    let cases: Vec<Case> = serde_json::from_str(&fs::read_to_string(corpus_path).unwrap()).unwrap();
    assert!(cases.len() >= 171, "The corpus must cover all six variants");

    for case in cases {
        let context = PreparedContext::new(case.topology).unwrap();
        assert_eq!(
            calculate_candidates(case.board.as_slice().try_into().unwrap(), &context).as_slice(),
            case.expected_candidates,
            "{} candidates",
            case.id
        );

        for probe in case.probes {
            let result = context
                .count(
                    &case.board,
                    probe.node_limit,
                    probe.work_limit,
                    probe.initial_work,
                )
                .unwrap_or_else(|error| panic!("{}: {error}", case.id));
            assert_eq!(result, probe.expected, "{} probe", case.id);
        }
    }
}
