use serde::Deserialize;
use std::{
    env,
    error::Error,
    fs,
    hint::black_box,
    time::{Duration, Instant},
};
use sudoku_core_benchmark::{Board, PreparedContext, SearchResult, Topology, calculate_candidates};

#[derive(Deserialize)]
struct Case {
    variant: String,
    benchmark: bool,
    board: Vec<u8>,
    topology: Topology,
}

fn batch(cases: &[(Board, PreparedContext)], candidates: bool) -> u64 {
    let mut checksum = 0;
    for (board, context) in black_box(cases) {
        if candidates {
            let masks = black_box(calculate_candidates(black_box(board), context));
            for (cell, mask) in masks.into_iter().enumerate() {
                checksum += u64::from(mask) * (cell as u64 + 1);
            }
        } else {
            let result = black_box(
                context
                    .count(black_box(board), 1_000_000, 4_000_000, 0)
                    .unwrap(),
            );
            let SearchResult::Complete {
                count,
                solution,
                nodes_visited,
                work_used,
            } = result
            else {
                panic!("Timed corpus unexpectedly exhausted");
            };
            checksum += u64::from(count) * 17 + nodes_visited * 31 + work_used * 37;
            if let Some(solution) = solution {
                for (cell, digit) in solution.into_iter().enumerate() {
                    checksum += u64::from(digit) * (cell as u64 + 1);
                }
            }
        }
    }
    checksum
}

fn main() -> Result<(), Box<dyn Error>> {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.len() != 3 {
        return Err("Expected corpus path, group and iteration count".into());
    }
    let group = &args[1];
    let iterations: usize = args[2].parse()?;
    if iterations == 0 {
        return Err("Iteration count must be positive".into());
    }
    let input: Vec<Case> = serde_json::from_str(&fs::read_to_string(&args[0])?)?;
    let mut cases = Vec::new();
    for case in input
        .into_iter()
        .filter(|case| case.benchmark && (group == "candidates" || &case.variant == group))
    {
        let board: Board = case.board.try_into().map_err(|_| "Invalid board length")?;
        if board.iter().any(|&digit| digit > 9) {
            return Err("Invalid board digit".into());
        }
        cases.push((board, PreparedContext::new(case.topology)?));
    }
    if cases.is_empty() {
        return Err("Unknown or empty benchmark group".into());
    }

    let candidates = group == "candidates";
    let warmup = Instant::now();
    while warmup.elapsed() < Duration::from_millis(250) {
        black_box(batch(&cases, candidates));
    }
    let mut checksum = 0;
    let started = Instant::now();
    for _ in 0..iterations {
        checksum += batch(&cases, candidates);
    }
    let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
    println!(
        "{}",
        serde_json::json!({ "elapsedMs": elapsed_ms, "checksum": checksum })
    );
    Ok(())
}
