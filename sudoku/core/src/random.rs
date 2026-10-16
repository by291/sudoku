use rand_chacha::ChaCha8Rng;
use rand_core::{Rng, SeedableRng};

use crate::types::{CoreResult, EngineError};

pub const SEED_LENGTH: usize = 32;
pub const ROOT_SEED_CONTEXT: &str = "sudoku 2026-10-16 root seed v1";
const U32_RANGE: f64 = 4294967296.0;

/// A binary seed has no text encoding; every value of the fixed-width byte array is valid.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Seed([u8; SEED_LENGTH]);

impl Seed {
    pub fn from_bytes(bytes: [u8; SEED_LENGTH]) -> Self {
        Self(bytes)
    }

    pub fn as_bytes(&self) -> &[u8; SEED_LENGTH] {
        &self.0
    }

    /// Derive a root seed from caller-owned byte material without choosing a text encoding.
    pub fn derive(material: &[u8]) -> Self {
        Self(blake3::derive_key(ROOT_SEED_CONTEXT, material))
    }
}

impl TryFrom<&[u8]> for Seed {
    type Error = EngineError;

    fn try_from(bytes: &[u8]) -> CoreResult<Self> {
        let seed = bytes
            .try_into()
            .map_err(|_| EngineError::InvalidSeedLength(bytes.len()))?;

        Ok(Self(seed))
    }
}

#[derive(Clone, Debug)]
pub struct SeededRandom(ChaCha8Rng);

impl SeededRandom {
    pub fn new(seed: &Seed) -> Self {
        Self(ChaCha8Rng::from_seed(*seed.as_bytes()))
    }

    pub fn next_u32(&mut self) -> u32 {
        self.0.next_u32()
    }

    /// One float consumes exactly one word; changing this mapping changes generated puzzles.
    pub fn next_f64(&mut self) -> f64 {
        f64::from(self.next_u32()) / U32_RANGE
    }

    /// Shuffle the caller's owned slice in place, with one word per descending swap.
    pub fn shuffle<T>(&mut self, values: &mut [T]) {
        for index in (1..values.len()).rev() {
            let partner = (self.next_f64() * (index + 1) as f64).floor() as usize;
            values.swap(index, partner);
        }
    }
}
