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
    assert_eq!(engine_info().bridge_version, 2);
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

#[test]
fn edit_validates_every_mask_before_note_length_and_action() {
    let prepared = prepare_puzzle(
        PrepareInputDto {
            rules: RulesDto::Classic,
            max_work: None,
        },
        Arc::new(CancellationToken::new()),
    )
    .unwrap();

    for length in [80, 82] {
        let mut notes = vec![0; length];
        // The oversized case must validate masks beyond the 81 cells it can retain.
        notes[length - 1] = 512;
        let error = prepared
            .edit(
                EditInputDto {
                    givens: BoardDto(vec![0; 81]),
                    entries: BoardDto(vec![0; 81]),
                    notes,
                    action: BoardEditDto::Enter {
                        cell: 81,
                        digit: DigitDto(0),
                    },
                    work: Some(WorkOptionsDto {
                        max_work: Some(4_000_001),
                        initial_work: None,
                    }),
                },
                Arc::new(CancellationToken::new()),
            )
            .err()
            .unwrap();

        assert!(
            matches!(error, NativeError::InvalidInput { reason } if reason == "Invalid nine-digit mask: 512")
        );
    }

    let error = prepared
        .edit(
            EditInputDto {
                givens: BoardDto(vec![0; 81]),
                entries: BoardDto(vec![0; 81]),
                notes: vec![0; 80],
                action: BoardEditDto::Erase { cell: 81 },
                work: None,
            },
            Arc::new(CancellationToken::new()),
        )
        .err()
        .unwrap();

    assert!(
        matches!(error, NativeError::InvalidInput { reason } if reason == "Notes require exactly 81 masks")
    );
}

#[test]
fn assessment_version_precedes_malformed_summary_and_summary_precedes_identity() {
    let identity = || AssessmentIdentityDto {
        variant: VariantDto::Classic,
        difficulty: DifficultyDto::Easy,
    };
    let malformed_summary = || AssessmentSummaryDto {
        rating_version: RatingVersionDto::V2,
        variant: VariantDto::Diagonal,
        difficulty: DifficultyDto::Hard,
        workload: WorkloadDto {
            steps: 1,
            placements: 0,
            eliminations: 0,
            candidate_removals: 0,
            technique_counts: std::collections::HashMap::new(),
            highest_tier: None,
            highest_technique: None,
            variant_steps: 0,
        },
    };

    let unsupported = validate_assessment(
        Some(StoredAssessmentDto::Rated {
            rating_version: "sudoku-rating-v1".into(),
            summary: Some(malformed_summary()),
        }),
        identity(),
    )
    .unwrap();
    let current = validate_assessment(
        Some(StoredAssessmentDto::Rated {
            rating_version: "sudoku-rating-v2".into(),
            summary: Some(malformed_summary()),
        }),
        identity(),
    )
    .unwrap();

    assert!(matches!(
        unsupported,
        AssessmentValidationDto::Present {
            value: PuzzleAssessmentDto::Unavailable {
                reason: UnavailableReasonDto::UnsupportedVersion,
                issues,
            }
        } if issues == ["Unsupported rating version"]
    ));
    assert!(matches!(
        current,
        AssessmentValidationDto::Present {
            value: PuzzleAssessmentDto::Unavailable {
                reason: UnavailableReasonDto::InvalidSummary,
                issues,
            }
        } if issues == ["Assessment technique counts must include every known technique"]
    ));
}
