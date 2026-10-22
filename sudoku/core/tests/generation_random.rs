use sudoku_core::generation::random::{RandomPhase, for_phase, phase_material, phase_seed};
use sudoku_core::generation::types::{GenerationInput, GenerationVersion};
use sudoku_core::random::Seed;
use sudoku_core::rules::types::SudokuVariant;
use sudoku_core::types::Difficulty;

fn variant(value: &str) -> SudokuVariant {
    match value {
        "classic" => SudokuVariant::Classic,
        "diagonal" => SudokuVariant::Diagonal,
        "jigsaw" => SudokuVariant::Jigsaw,
        "killer" => SudokuVariant::Killer,
        "thermo" => SudokuVariant::Thermo,
        "arrow" => SudokuVariant::Arrow,
        _ => panic!("Unknown fixture variant"),
    }
}

#[test]
fn phase_stream_matches_v11_byte_vectors() {
    let rows: Vec<serde_json::Value> = serde_json::from_str(include_str!(
        "../../../tests/fixtures/engine-contracts/random.json"
    ))
    .unwrap();
    let mut checked = 0;
    for row in rows.iter().filter(|row| row["kind"] == "phase") {
        let bytes: Vec<u8> = serde_json::from_value(row["seed"].clone()).unwrap();
        let difficulty = Difficulty::ALL
            .into_iter()
            .find(|difficulty| difficulty.as_str() == row["difficulty"].as_str().unwrap())
            .unwrap();
        let input = GenerationInput::new(
            variant(row["variant"].as_str().unwrap()),
            difficulty,
            Seed::try_from(bytes.as_slice()).unwrap(),
        )
        .unwrap();
        let phase = match row["phase"].as_str().unwrap() {
            "terminal" => RandomPhase::Terminal,
            "geometry" => RandomPhase::Geometry,
            "candidate" => RandomPhase::Candidate,
            _ => panic!("Unknown phase"),
        };
        let layout = row["layout"].as_u64().unwrap() as u32;
        let proposal = row["proposal"].as_u64().unwrap() as u32;

        let material = phase_material(&input, phase, layout, proposal);
        let key = phase_seed(&input, phase, layout, proposal);
        let mut words = for_phase(&input, phase, layout, proposal);
        let mut floats = for_phase(&input, phase, layout, proposal);

        assert_eq!(serde_json::json!(material.to_vec()), row["material"]);
        assert_eq!(serde_json::json!(key.as_bytes().to_vec()), row["key"]);
        for expected in row["words"].as_array().unwrap() {
            let expected = expected.as_u64().unwrap() as u32;
            assert_eq!(words.next_u32(), expected);
            assert_eq!(floats.next_f64(), f64::from(expected) / 4294967296.0);
        }
        checked += 1;
    }
    assert_eq!(checked, 513);
}

#[test]
fn v10_generation_requests_are_rejected() {
    assert!(GenerationVersion::parse("sudoku-v10").is_err());
    assert!(GenerationVersion::parse("sudoku-variants-v10").is_err());
    assert!(
        GenerationInput::from_version(
            SudokuVariant::Classic,
            Difficulty::Easy,
            Seed::from_bytes([0; 32]),
            "sudoku-variants-v12"
        )
        .is_err()
    );
    assert!(
        GenerationInput::new(
            SudokuVariant::Arrow,
            Difficulty::Expert,
            Seed::from_bytes([0; 32])
        )
        .is_err()
    );
}

#[test]
fn candidate_failure_does_not_replace_future_geometry() {
    let input = GenerationInput::new(
        SudokuVariant::Killer,
        Difficulty::Hard,
        Seed::from_bytes([255; 32]),
    )
    .unwrap();
    let mut before = for_phase(&input, RandomPhase::Geometry, 1, 0);
    let mut abandoned = for_phase(&input, RandomPhase::Candidate, 0, 7);
    for _ in 0..10000 {
        abandoned.next_u32();
    }
    let mut after = for_phase(&input, RandomPhase::Geometry, 1, 0);

    for _ in 0..20 {
        assert_eq!(before.next_u32(), after.next_u32());
    }
}
