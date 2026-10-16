//! Release-audit driver: decode/prepare/verify outside timed intervals; the core owns no I/O.
#[path = "contracts/assessment.rs"]
pub mod assessment_contracts;
#[path = "../tests/support/rules.rs"]
pub mod fixtures;
#[path = "contracts/generation.rs"]
pub mod generation_contracts;
#[path = "contracts/projection.rs"]
pub mod logical_projection;
#[path = "contracts/search.rs"]
pub mod search_contracts;
#[path = "contracts/violations.rs"]
pub mod violation_projection;

use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    hint::black_box,
    io::{self, Read},
    time::Instant,
};
use sudoku_core::{
    budget::WorkBudget,
    constraints::{computation::prepare_computation, types::PreparedComputation},
    generation::generate::generate_puzzle,
    search::exact::count_solutions,
    types::{Board, Bounded},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Probe {
    node_limit: u64,
    work_limit: u64,
    initial_work: u64,
    expected: Value,
}
#[derive(Deserialize)]
struct Kernel {
    id: String,
    board: Vec<u8>,
    rules: Value,
    probes: Vec<Probe>,
}
#[derive(Deserialize)]
struct Generation {
    id: String,
    input: generation_contracts::GenerationInputDto,
    expected: Value,
}
#[derive(Deserialize)]
struct Input {
    kernels: Vec<Kernel>,
    generation: Vec<Generation>,
}
struct Prepared {
    variant: String,
    board: Board,
    computation: PreparedComputation,
    probe: Probe,
}

fn count(entry: &Prepared) -> sudoku_core::search::types::SearchResult {
    let mut budget = WorkBudget::new(entry.probe.work_limit);
    assert!(budget.consume(entry.probe.initial_work));
    count_solutions(
        &entry.board,
        &entry.computation,
        &mut budget,
        entry.probe.node_limit,
    )
}

fn seed_costs() -> Value {
    use sudoku_core::generation::{
        random::{RandomPhase, for_phase},
        types::GenerationInput,
    };
    use sudoku_core::random::Seed;
    use sudoku_core::rules::types::SudokuVariant;
    use sudoku_core::types::Difficulty;
    let material = [7_u8; 32];
    let started = Instant::now();
    let mut checksum = 0_u64;
    for _ in 0..10_000 {
        checksum += u64::from(Seed::derive(black_box(&material)).as_bytes()[0]);
    }
    let derivation_ns = started.elapsed().as_secs_f64() * 1e9 / 10_000.0;
    let input = GenerationInput::new(
        SudokuVariant::Classic,
        Difficulty::Easy,
        Seed::try_from(material.as_slice()).unwrap(),
    )
    .unwrap();
    let started = Instant::now();
    let mut stream_checksum = 0_u64;
    for _ in 0..1000 {
        let mut random = for_phase(black_box(&input), RandomPhase::Terminal, 0, 0);
        for _ in 0..256 {
            stream_checksum += u64::from(random.next_u32());
        }
    }
    json!({"nsPerDerivation":derivation_ns,"checksum":checksum,"phaseAnd256Words":{"nsPerStream":started.elapsed().as_secs_f64()*1e9/1000.0,"checksum":stream_checksum}})
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut text = String::new();
    io::stdin().read_to_string(&mut text)?;
    let input: Input = serde_json::from_str(&text)?;
    let mut entries = vec![];
    let mut preparation_ms = 0.0;
    for kernel in input.kernels {
        let board = Board::try_from(kernel.board.as_slice())?;
        let rules = fixtures::decode_rules(&kernel.rules)?;
        let started = Instant::now();
        let Bounded::Complete(computation) =
            prepare_computation(&rules, &mut WorkBudget::new(4_000_000))?
        else {
            return Err("Incomplete benchmark preparation".into());
        };
        preparation_ms += started.elapsed().as_secs_f64() * 1000.0;
        for probe in &kernel.probes {
            let mut budget = WorkBudget::new(probe.work_limit);
            assert!(budget.consume(probe.initial_work));
            let actual = count_solutions(&board, &computation, &mut budget, probe.node_limit);
            assert_eq!(
                search_contracts::project(actual),
                probe.expected,
                "Kernel payload mismatch: {}",
                kernel.id
            );
        }
        entries.push(Prepared {
            variant: rules.variant().as_str().to_owned(),
            board,
            computation,
            probe: kernel.probes.into_iter().next().ok_or("Missing probe")?,
        });
    }
    let mut groups = vec![];
    for variant in ["classic", "diagonal", "jigsaw", "killer", "thermo", "arrow"] {
        let group: Vec<_> = entries
            .iter()
            .filter(|entry| entry.variant == variant)
            .collect();
        let started = Instant::now();
        for entry in &group {
            black_box(count(entry));
        }
        let pilot_ms = started.elapsed().as_secs_f64() * 1000.0;
        let repetitions = (150.0 / pilot_ms.max(0.001)).ceil().clamp(1.0, 10_000.0) as u32;
        let mut samples = vec![];
        for _ in 0..5 {
            let started = Instant::now();
            for _ in 0..repetitions {
                for entry in &group {
                    black_box(count(entry));
                }
            }
            samples.push(started.elapsed().as_secs_f64() * 1000.0 / f64::from(repetitions));
        }
        groups.push(json!({"variant":variant,"boards":group.len(),"repetitions":repetitions,"sweepMs":samples}));
    }
    let mut generated = vec![];
    for row in input.generation {
        let (request, limits) = generation_contracts::decode(row.input)?;
        let check = generation_contracts::project(generate_puzzle(&request, &limits)?, false)?;
        assert_eq!(
            check["result"], row.expected,
            "Generation preflight mismatch: {}",
            row.id
        );
        let started = Instant::now();
        let result = generate_puzzle(&request, &limits)?;
        let duration_ms = started.elapsed().as_secs_f64() * 1000.0;
        let value = generation_contracts::project(result, false)?;
        assert_eq!(
            value["result"], row.expected,
            "Generation payload mismatch: {}",
            row.id
        );
        generated.push(json!({"id":row.id,"durationMs":duration_ms}));
    }
    println!(
        "{}",
        json!({"seedCosts":seed_costs(),"preparationMs":preparation_ms,"kernels":groups,"generation":generated})
    );
    Ok(())
}
