use std::sync::Arc;
use sudoku_ffi::*;

#[test]
fn rejects_invalid_boards_and_keeps_prepared_snapshots_owned() {
    let token = Arc::new(CancellationToken::new());
    let prepared = prepare_puzzle(
        PrepareInputDto {
            rules: RulesDto::Classic,
            max_work: None,
        },
        token.clone(),
    )
    .unwrap();
    assert!(prepared.is_complete(BoardDto(vec![0; 80])).is_err());
    let mut metadata = prepared.metadata().unwrap();
    metadata.duplicate_peers[0].clear();
    assert_eq!(prepared.metadata().unwrap().duplicate_peers[0].len(), 20);
    assert_eq!(
        prepared.base_candidates(BoardDto(vec![0; 81])).unwrap(),
        vec![511; 81]
    );
}

#[test]
fn cancellation_is_independent_and_not_budget_exhaustion() {
    let token = Arc::new(CancellationToken::new());
    token.cancel();
    let error = prepare_puzzle(
        PrepareInputDto {
            rules: RulesDto::Classic,
            max_work: Some(0),
        },
        token,
    )
    .err()
    .unwrap();
    assert!(matches!(error, NativeError::Cancelled { .. }));
}

#[test]
fn seed_and_bridge_are_current_and_checked() {
    assert_eq!(engine_info().bridge_version, 1);
    assert_eq!(derive_seed(b"daily:2026-10-16".to_vec()).len(), 32);
    let options = GenerationOptionsDto {
        variant: VariantDto::Classic,
        difficulty: DifficultyDto::Easy,
        puzzle_version: GenerationVersionDto::ClassicV11,
        limits: None,
    };
    assert!(matches!(
        generate(vec![0; 31], options, Arc::new(CancellationToken::new())),
        Err(NativeError::InvalidInput { .. })
    ));
}

#[test]
fn assessment_absence_and_old_version_are_not_corrupt_games() {
    let identity = || AssessmentIdentityDto {
        variant: VariantDto::Classic,
        difficulty: DifficultyDto::Easy,
    };
    assert!(matches!(
        validate_assessment(None, identity()).unwrap(),
        AssessmentValidationDto::Absent
    ));

    let result = validate_assessment(
        Some(StoredAssessmentDto::Rated {
            rating_version: "sudoku-rating-v1".into(),
            summary: None,
        }),
        identity(),
    )
    .unwrap();
    assert!(matches!(
        result,
        AssessmentValidationDto::Present {
            value: PuzzleAssessmentDto::Unavailable {
                reason: UnavailableReasonDto::UnsupportedVersion,
                ..
            }
        }
    ));
}
