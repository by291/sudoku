//! Test-only JSONL adapter; the reusable library performs no I/O or platform work.
use std::io::{self, BufRead};

use serde::Deserialize;
use sudoku_core::random::{Seed, SeededRandom};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(tag = "suite", content = "input")]
enum Request {
    #[serde(rename = "random")]
    Random { seed: Vec<u8>, count: usize },
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    for line in io::stdin().lock().lines() {
        let request: Request = serde_json::from_str(&line?)?;
        let Request::Random { seed, count } = request;
        if count > 10000 {
            return Err("Fixture stream length exceeds 10000 words".into());
        }
        let seed = Seed::try_from(seed.as_slice())?;
        let mut random = SeededRandom::new(&seed);
        let words: Vec<u32> = (0..count).map(|_| random.next_u32()).collect();

        println!("{}", serde_json::to_string(&words)?);
    }
    Ok(())
}
