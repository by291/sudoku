use serde::Deserialize;
use sudoku_core::random::{Seed, SeededRandom};

#[test]
fn byte_seed_rejects_wrong_lengths_without_text_decoding() {
    for length in [0, 31, 33] {
        assert!(Seed::try_from(vec![0_u8; length].as_slice()).is_err());
    }

    let seed = Seed::try_from([255_u8; 32].as_slice()).unwrap();

    assert_eq!(seed.as_bytes(), &[255_u8; 32]);
    assert_eq!(Seed::from_bytes([0; 32]).as_bytes(), &[0; 32]);
}

#[derive(Deserialize)]
struct RandomVector {
    kind: String,
    seed: Vec<u8>,
    words: Vec<u32>,
}

#[test]
fn matches_chacha8_and_blake3_reference_vectors() {
    let vectors: Vec<RandomVector> = serde_json::from_str(include_str!(
        "../../../tests/fixtures/engine-contracts/random.json"
    ))
    .unwrap();

    for vector in vectors.iter().filter(|vector| vector.kind == "raw") {
        let seed = Seed::try_from(vector.seed.as_slice()).unwrap();
        let mut words = SeededRandom::new(&seed);
        let mut floats = SeededRandom::new(&seed);

        for expected in &vector.words {
            assert_eq!(words.next_u32(), *expected);
            assert_eq!(floats.next_f64(), f64::from(*expected) / 4294967296.0);
        }
    }

    // Independently derived by the pinned JS BLAKE3 reference, not this Rust implementation.
    let expected = [
        192, 49, 10, 214, 144, 151, 78, 22, 90, 7, 85, 25, 27, 44, 188, 244, 236, 111, 36, 156, 67,
        77, 166, 174, 12, 194, 22, 62, 194, 26, 8, 89,
    ];
    assert_eq!(Seed::derive(b"daily:2026-10-16").as_bytes(), &expected);
}
