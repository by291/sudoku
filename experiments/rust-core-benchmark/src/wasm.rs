use crate::{Board, PreparedContext, SearchResult, Topology, calculate_candidates, validate_board};
use serde::Deserialize;
use std::hint::black_box;
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
struct InputCase {
    variant: String,
    benchmark: bool,
    board: Vec<u8>,
    topology: Topology,
}

const GROUPS: [&str; 7] = [
    "candidates",
    "classic",
    "diagonal",
    "jigsaw",
    "killer",
    "thermo",
    "arrow",
];

/// Owns prepared geometry and corpus boards until JavaScript calls the generated free method.
#[wasm_bindgen]
pub struct WasmBenchmark {
    cases: Vec<(Board, PreparedContext)>,
    groups: Vec<Vec<usize>>,
}

#[wasm_bindgen]
impl WasmBenchmark {
    #[wasm_bindgen(constructor)]
    pub fn new(corpus: &str) -> Result<WasmBenchmark, JsValue> {
        let inputs: Vec<InputCase> =
            serde_json::from_str(corpus).map_err(|error| JsValue::from_str(&error.to_string()))?;
        let mut cases = Vec::new();
        let mut groups = vec![Vec::new(); GROUPS.len()];
        for (index, input) in inputs.into_iter().enumerate() {
            let board = *validate_board(&input.board).map_err(|error| JsValue::from_str(&error))?;
            let context =
                PreparedContext::new(input.topology).map_err(|error| JsValue::from_str(&error))?;
            if input.benchmark {
                let group = GROUPS
                    .iter()
                    .position(|&group| group == input.variant)
                    .filter(|&group| group != 0)
                    .ok_or_else(|| JsValue::from_str("Unknown variant"))?;
                groups[0].push(index);
                groups[group].push(index);
            }
            cases.push((board, context));
        }
        Ok(Self { cases, groups })
    }

    /// Copies an input board and returns an owned typed array through wasm-bindgen.
    pub fn candidates(&self, index: usize, board: &[u8]) -> Result<Vec<u16>, JsValue> {
        let context = &self
            .cases
            .get(index)
            .ok_or_else(|| JsValue::from_str("Unknown case"))?
            .1;
        let board = validate_board(board).map_err(|error| JsValue::from_str(&error))?;
        Ok(calculate_candidates(board, context).to_vec())
    }

    /// Header: status (0 complete / 1 exhausted), count, nodes, work; then the first solution.
    /// The returned numeric array is owned by JavaScript; no view borrows growable WASM memory.
    pub fn solve(
        &self,
        index: usize,
        board: &[u8],
        nodes: u32,
        work: u32,
        initial: u32,
    ) -> Result<Vec<u32>, JsValue> {
        let context = &self
            .cases
            .get(index)
            .ok_or_else(|| JsValue::from_str("Unknown case"))?
            .1;
        let result = context
            .count(board, u64::from(nodes), u64::from(work), u64::from(initial))
            .map_err(|error| JsValue::from_str(&error))?;
        Ok(match result {
            SearchResult::Complete {
                count,
                solution,
                nodes_visited,
                work_used,
            } => {
                let mut output = vec![0, u32::from(count), nodes_visited as u32, work_used as u32];
                if let Some(solution) = solution {
                    output.extend(solution.into_iter().map(u32::from));
                }
                output
            }
            SearchResult::BudgetExhausted {
                nodes_visited,
                work_used,
            } => vec![1, 0, nodes_visited as u32, work_used as u32],
        })
    }

    /// Resident batch measurement excludes repeated input/output copies across the JS boundary.
    pub fn batch(&self, group: usize, iterations: u32) -> Result<f64, JsValue> {
        let indices = self
            .groups
            .get(group)
            .ok_or_else(|| JsValue::from_str("Unknown group"))?;
        if indices.is_empty() || iterations == 0 {
            return Err(JsValue::from_str("Empty workload"));
        }
        let mut checksum = 0_u64;
        for _ in 0..iterations {
            for &index in indices {
                let (board, context) = &self.cases[index];
                if group == 0 {
                    let masks = black_box(calculate_candidates(black_box(board), context));
                    for (cell, mask) in masks.into_iter().enumerate() {
                        checksum += u64::from(mask) * (cell as u64 + 1);
                    }
                } else {
                    let result =
                        black_box(context.count(black_box(board), 1_000_000, 4_000_000, 0))
                            .map_err(|error| JsValue::from_str(&error))?;
                    let SearchResult::Complete {
                        count,
                        solution,
                        nodes_visited,
                        work_used,
                    } = result
                    else {
                        return Err(JsValue::from_str("Timed corpus exhausted"));
                    };
                    checksum += u64::from(count) * 17 + nodes_visited * 31 + work_used * 37;
                    if let Some(solution) = solution {
                        for (cell, digit) in solution.into_iter().enumerate() {
                            checksum += u64::from(digit) * (cell as u64 + 1);
                        }
                    }
                }
            }
        }
        Ok(black_box(checksum) as f64)
    }
}
