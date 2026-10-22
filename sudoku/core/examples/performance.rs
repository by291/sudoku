//! Reproducible end-to-end timings; output digests check consistency, not mathematical correctness.
use std::sync::Arc;
use std::time::{Duration, Instant};

use sudoku_core::control::{CancellationProbe, ExecutionControl};
use sudoku_core::generation::generate::generate_puzzle_with_control;
use sudoku_core::generation::types::{GenerationInput, GenerationLimits, GenerationOutcome};
use sudoku_core::random::Seed;
use sudoku_core::rating::assessment::assess_puzzle_with_control;
use sudoku_core::rating::input::create_assessment_input;
use sudoku_core::rating::policies::supported_difficulties;
use sudoku_core::rating::types::AssessmentLimits;
use sudoku_core::rules::types::SudokuVariant;

#[derive(Debug)]
struct Deadline(Instant);

impl CancellationProbe for Deadline {
    fn is_cancelled(&self) -> bool {
        self.0.elapsed() >= Duration::from_secs(3)
    }
}

fn control() -> ExecutionControl {
    ExecutionControl::with_cancellation(Arc::new(Deadline(Instant::now())))
}

fn summary(mut samples: Vec<f64>) -> serde_json::Value {
    samples.sort_by(f64::total_cmp);
    if samples.is_empty() {
        return serde_json::Value::Null;
    }
    serde_json::json!({
        "total_ms": samples.iter().sum::<f64>(),
        "median_ms": samples[samples.len() / 2],
        "p95_ms": samples[(samples.len() - 1) * 95 / 100],
    })
}

fn main() {
    let seeds: u8 = std::env::args()
        .nth(1)
        .map_or(16, |value| value.parse().unwrap());
    let repetitions: usize = std::env::args()
        .nth(2)
        .map_or(3, |value| value.parse().unwrap());
    assert!(seeds > 0 && repetitions > 0);

    for variant in [
        SudokuVariant::Classic,
        SudokuVariant::Killer,
        SudokuVariant::Arrow,
        SudokuVariant::Thermo,
        SudokuVariant::Diagonal,
        SudokuVariant::Jigsaw,
    ] {
        for &difficulty in supported_difficulties(variant) {
            let mut generation_times = vec![];
            let mut assessment_times = vec![];
            let mut digest = blake3::Hasher::new();
            let mut ready = 0;
            let mut cancelled = 0;

            for _ in 0..repetitions {
                for seed in 0..seeds {
                    let input =
                        GenerationInput::new(variant, difficulty, Seed::from_bytes([seed; 32]))
                            .unwrap();
                    let mut generation_control = control();
                    let started = Instant::now();
                    let result = generate_puzzle_with_control(
                        &input,
                        &GenerationLimits::default(),
                        &mut generation_control,
                    )
                    .unwrap();
                    generation_times.push(started.elapsed().as_secs_f64() * 1000.0);
                    if generation_control.is_cancelled() {
                        cancelled += 1;
                        continue;
                    }
                    digest.update(format!("{result:?}").as_bytes());

                    if let GenerationOutcome::Ready { puzzle, .. } = result.outcome {
                        ready += 1;
                        let input = create_assessment_input(
                            &puzzle.content.givens,
                            &puzzle.content.rules,
                            AssessmentLimits::default(),
                        );
                        let mut assessment_control = control();
                        let started = Instant::now();
                        let result = assess_puzzle_with_control(&input, &mut assessment_control);
                        assessment_times.push(started.elapsed().as_secs_f64() * 1000.0);
                        if assessment_control.is_cancelled() {
                            cancelled += 1;
                        } else {
                            digest.update(format!("{result:?}").as_bytes());
                        }
                    }
                }
            }
            println!(
                "{}",
                serde_json::json!({
                    "variant": variant.as_str(), "difficulty": format!("{difficulty:?}"),
                    "samples": usize::from(seeds) * repetitions, "ready": ready, "cancelled": cancelled,
                    "generation": summary(generation_times), "assessment": summary(assessment_times),
                    "digest": digest.finalize().to_hex().as_str(),
                })
            );
        }
    }
}
