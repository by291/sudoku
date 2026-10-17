use sudoku_core::rating::decoding::decode_puzzle_assessment;
use sudoku_core::rating::types::{
    AssessmentIdentity, PuzzleAssessment, StoredAssessment, UnavailableReason,
};
use sudoku_core::rules::types::SudokuVariant;
use sudoku_core::types::Difficulty;

#[test]
fn summary_absence_is_not_corruption() {
    let identity = AssessmentIdentity {
        variant: SudokuVariant::Classic,
        difficulty: Difficulty::Easy,
    };

    assert_eq!(decode_puzzle_assessment(None, identity), None);
    for reason in [
        UnavailableReason::Ungraded,
        UnavailableReason::BudgetExhausted,
        UnavailableReason::InvalidInput,
        UnavailableReason::InvalidSummary,
        UnavailableReason::UnsupportedVersion,
        UnavailableReason::IdentityMismatch,
    ] {
        let stored = StoredAssessment::Unavailable {
            reason,
            issues: vec![],
        };

        assert_eq!(
            decode_puzzle_assessment(Some(&stored), identity),
            Some(PuzzleAssessment::Unavailable {
                reason,
                issues: vec![]
            })
        );
    }
}

fn one_step_summary() -> sudoku_core::rating::types::DifficultyAssessment {
    use sudoku_core::logic::techniques::{ALL_TECHNIQUES, Technique};
    use sudoku_core::rating::types::{DifficultyAssessment, ReasoningWorkload, TechniqueCounts};

    let counts: Vec<_> = ALL_TECHNIQUES
        .into_iter()
        .map(|technique| (technique, u64::from(technique == Technique::NakedSingle)))
        .collect();
    DifficultyAssessment {
        variant: SudokuVariant::Classic,
        difficulty: Difficulty::Easy,
        workload: ReasoningWorkload {
            steps: 1,
            placements: 1,
            eliminations: 0,
            candidate_removals: 0,
            technique_counts: TechniqueCounts::from_entries(&counts).unwrap(),
            highest_tier: Some(Difficulty::Easy),
            highest_technique: Some(Technique::NakedSingle),
            variant_steps: 0,
        },
    }
}

#[test]
fn rejects_contradictory_workload_and_finite_board_overflow() {
    use sudoku_core::rating::decoding::validate_summary;
    use sudoku_core::rating::types::ReasoningWorkload;

    type Mutation = (&'static str, fn(&mut ReasoningWorkload));
    let changes: [Mutation; 9] = [
        ("wrong total", |value| value.steps = 2),
        ("ineffective placement", |value| value.placements = 0),
        ("missing elimination", |value| value.eliminations = 1),
        ("unexplained removal", |value| value.candidate_removals = 1),
        ("classic variant evidence", |value| value.variant_steps = 1),
        ("wrong highest tier", |value| {
            value.highest_tier = Some(Difficulty::Hard)
        }),
        ("missing highest technique", |value| {
            value.highest_technique = None
        }),
        ("unsafe count", |value| value.steps = u64::MAX),
        ("more than 81 placements", |value| value.placements = 82),
    ];
    let baseline = one_step_summary();
    assert_eq!(validate_summary(&baseline).unwrap(), baseline);
    for (name, mutate) in changes {
        let mut changed = baseline.clone();
        mutate(&mut changed.workload);

        assert!(validate_summary(&changed).is_err(), "{name}");
    }
}

#[test]
fn retains_version_and_identity_failure_precedence_without_changing_absence() {
    use sudoku_core::rating::types::RATING_VERSION;

    let identity = AssessmentIdentity {
        variant: SudokuVariant::Classic,
        difficulty: Difficulty::Easy,
    };
    let summary = one_step_summary();
    let record = StoredAssessment::Rated {
        rating_version: RATING_VERSION.to_string(),
        summary: Ok(summary.clone()),
    };

    assert_eq!(
        decode_puzzle_assessment(Some(&record), identity),
        Some(PuzzleAssessment::Rated(summary))
    );
    let mismatched = AssessmentIdentity {
        difficulty: Difficulty::Medium,
        ..identity
    };
    assert!(matches!(
        decode_puzzle_assessment(Some(&record), mismatched),
        Some(PuzzleAssessment::Unavailable {
            reason: UnavailableReason::IdentityMismatch,
            ..
        })
    ));
    let old = StoredAssessment::Rated {
        rating_version: "sudoku-rating-v1".to_string(),
        summary: Err(vec!["Invalid summary".to_string()]),
    };
    assert!(matches!(
        decode_puzzle_assessment(Some(&old), identity),
        Some(PuzzleAssessment::Unavailable {
            reason: UnavailableReason::UnsupportedVersion,
            ..
        })
    ));
}

#[test]
fn unsafe_counts_precede_inapplicable_techniques_and_action_contradictions() {
    use sudoku_core::logic::techniques::{ALL_TECHNIQUES, Technique};
    use sudoku_core::rating::decoding::validate_summary;
    use sudoku_core::rating::types::TechniqueCounts;
    use sudoku_core::types::EngineError;

    let mut summary = one_step_summary();
    let counts: Vec<_> = ALL_TECHNIQUES
        .into_iter()
        .map(|technique| (technique, u64::from(technique == Technique::XWing)))
        .collect();
    summary.workload.technique_counts = TechniqueCounts::from_entries(&counts).unwrap();
    summary.workload.steps = u64::MAX;
    summary.workload.placements = 82;

    let unsafe_counts = validate_summary(&summary);
    summary.workload.steps = 1;
    let inapplicable_technique = validate_summary(&summary);
    summary.workload.technique_counts = one_step_summary().workload.technique_counts;
    let contradictory_actions = validate_summary(&summary);

    assert_eq!(
        unsafe_counts,
        Err(EngineError::invalid("Invalid assessment workload counts"))
    );
    assert_eq!(
        inapplicable_technique,
        Err(EngineError::invalid(
            "Invalid or inapplicable assessment technique count"
        ))
    );
    assert_eq!(
        contradictory_actions,
        Err(EngineError::invalid("Contradictory assessment workload"))
    );
}
