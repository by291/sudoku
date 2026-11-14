use super::types::{GenerationInput, GenerationVersion};
use crate::random::{SEED_LENGTH, Seed, SeededRandom};
use crate::rules::types::SudokuVariant;
use crate::types::Difficulty;

const VARIANT_TAG_INDEX: usize = SEED_LENGTH;
const DIFFICULTY_TAG_INDEX: usize = VARIANT_TAG_INDEX + 1;
const PHASE_TAG_INDEX: usize = DIFFICULTY_TAG_INDEX + 1;
const LAYOUT_INDEX_START: usize = PHASE_TAG_INDEX + 1;
const PROPOSAL_INDEX_START: usize = LAYOUT_INDEX_START + size_of::<u32>();
const MATERIAL_LENGTH: usize = PROPOSAL_INDEX_START + size_of::<u32>();

#[derive(Clone, Copy, Debug)]
pub enum RandomPhase {
    Terminal,
    Geometry,
    Candidate,
}

/// Fixed-width recipe: root bytes, variant/tier/phase tags, then two little-endian u32 indices.
pub fn phase_material(
    input: &GenerationInput,
    phase: RandomPhase,
    layout_index: u32,
    proposal_index: u32,
) -> [u8; MATERIAL_LENGTH] {
    let mut material = [0; MATERIAL_LENGTH];
    material[..SEED_LENGTH].copy_from_slice(input.seed.as_bytes());
    material[VARIANT_TAG_INDEX] = match input.variant {
        SudokuVariant::Classic => 0,
        SudokuVariant::Diagonal => 1,
        SudokuVariant::Jigsaw => 2,
        SudokuVariant::Killer => 3,
        SudokuVariant::Thermo => 4,
        SudokuVariant::Arrow => 5,
    };
    material[DIFFICULTY_TAG_INDEX] = match input.difficulty {
        Difficulty::Easy => 0,
        Difficulty::Medium => 1,
        Difficulty::Hard => 2,
        Difficulty::Expert => 3,
    };
    material[PHASE_TAG_INDEX] = match phase {
        RandomPhase::Terminal => 0,
        RandomPhase::Geometry => 1,
        RandomPhase::Candidate => 2,
    };
    material[LAYOUT_INDEX_START..PROPOSAL_INDEX_START].copy_from_slice(&layout_index.to_le_bytes());
    material[PROPOSAL_INDEX_START..].copy_from_slice(&proposal_index.to_le_bytes());

    material
}

/// Derive a phase seed using the version-specific stream domain.
pub fn phase_seed(
    input: &GenerationInput,
    phase: RandomPhase,
    layout_index: u32,
    proposal_index: u32,
) -> Seed {
    // V12 changes scheduling, but intentionally reuses the V11 stream recipe and byte vectors.
    let context = match input.puzzle_version {
        GenerationVersion::ClassicV12 => "sudoku 2026-10-16 streams sudoku-v11",
        GenerationVersion::VariantsV12 => "sudoku 2026-10-16 streams sudoku-variants-v11",
    };
    Seed::from_bytes(blake3::derive_key(
        context,
        &phase_material(input, phase, layout_index, proposal_index),
    ))
}

/// Each phase/owner gets an independent zero-counter ChaCha8 stream; abandoned candidates cannot
/// shift layouts.
pub fn for_phase(
    input: &GenerationInput,
    phase: RandomPhase,
    layout_index: u32,
    proposal_index: u32,
) -> SeededRandom {
    SeededRandom::new(&phase_seed(input, phase, layout_index, proposal_index))
}
