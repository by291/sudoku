use super::input::MAX_ASSESSMENT_STEPS;
use super::policies::{policy, supports_difficulty, technique_tier};
use super::types::{
    AssessmentIdentity, DifficultyAssessment, PuzzleAssessment, RATING_VERSION, ReasoningWorkload,
    StoredAssessment, TechniqueCounts, UnavailableReason,
};
use crate::logic::techniques::{ALL_TECHNIQUES, Technique, TechniqueAction};
use crate::rules::types::SudokuVariant;
use crate::types::{BOARD_SIZE, CoreResult, Difficulty, EngineError, UNIT_SIZE};

const MAX_SAFE_INTEGER: u64 = 9007199254740991;

impl TechniqueCounts {
    /// Decode exact catalogue coverage before applying summary arithmetic invariants.
    pub fn from_entries(entries: &[(Technique, u64)]) -> CoreResult<Self> {
        if entries.len() != ALL_TECHNIQUES.len() {
            return Err(EngineError::invalid(
                "Assessment technique counts must include every known technique",
            ));
        }

        let mut seen = [false; ALL_TECHNIQUES.len()];
        let mut counts = Self::default();
        for &(technique, count) in entries {
            if seen[technique as usize] || count > MAX_SAFE_INTEGER {
                return Err(EngineError::invalid(
                    "Invalid or inapplicable assessment technique count",
                ));
            }
            seen[technique as usize] = true;
            counts.0[technique as usize] = count;
        }

        Ok(counts)
    }
}

struct TechniqueAccounting {
    total: u128,
    required_placements: u128,
    required_eliminations: u128,
    required_variant_steps: u128,
    highest: Option<Technique>,
}

fn validate_count_bounds(workload: &ReasoningWorkload) -> CoreResult<()> {
    if [
        workload.steps,
        workload.placements,
        workload.eliminations,
        workload.candidate_removals,
        workload.variant_steps,
    ]
    .iter()
    .any(|&count| count > MAX_SAFE_INTEGER)
    {
        return Err(EngineError::invalid("Invalid assessment workload counts"));
    }

    Ok(())
}

fn summarize_technique_counts(summary: &DifficultyAssessment) -> CoreResult<TechniqueAccounting> {
    let workload = &summary.workload;
    let allowed = policy(summary.variant, summary.difficulty);
    let order = policy(summary.variant, Difficulty::Expert);
    let mut total = 0_u128;
    let mut required_placements = 0_u128;
    let mut required_eliminations = 0_u128;
    let mut required_variant_steps = 0_u128;
    let mut highest = None;

    for technique in ALL_TECHNIQUES {
        let count = workload.technique_counts.count(technique);
        if count > MAX_SAFE_INTEGER || (count > 0 && !allowed.contains(&technique)) {
            return Err(EngineError::invalid(
                "Invalid or inapplicable assessment technique count",
            ));
        }

        total += u128::from(count);
        match technique.action() {
            TechniqueAction::Placement => required_placements += u128::from(count),
            TechniqueAction::Elimination => required_eliminations += u128::from(count),
            TechniqueAction::Either => {}
        }
        if !technique.is_classic() {
            required_variant_steps += u128::from(count);
        }
        if count > 0
            && highest.is_none_or(|previous| {
                order.iter().position(|&item| item == technique)
                    > order.iter().position(|&item| item == previous)
            })
        {
            highest = Some(technique);
        }
    }

    Ok(TechniqueAccounting {
        total,
        required_placements,
        required_eliminations,
        required_variant_steps,
        highest,
    })
}

fn validate_action_accounting(
    workload: &ReasoningWorkload,
    variant: SudokuVariant,
    accounting: &TechniqueAccounting,
) -> CoreResult<()> {
    // Replay never adds candidates, so actions and candidate removals have finite board bounds.
    if workload.steps > u64::from(MAX_ASSESSMENT_STEPS)
        || workload.placements > BOARD_SIZE as u64
        || workload.candidate_removals > (BOARD_SIZE * UNIT_SIZE) as u64
        || u128::from(workload.placements) < accounting.required_placements
        || u128::from(workload.eliminations) < accounting.required_eliminations
        || u128::from(workload.variant_steps) < accounting.required_variant_steps
        || (variant == SudokuVariant::Classic && workload.variant_steps != 0)
        || workload.steps != workload.placements + workload.eliminations
        || u128::from(workload.steps) != accounting.total
        || workload.candidate_removals < workload.eliminations
        || (workload.eliminations == 0 && workload.candidate_removals != 0)
        || workload.variant_steps > workload.steps
    {
        return Err(EngineError::invalid("Contradictory assessment workload"));
    }

    Ok(())
}

fn validate_technique_consistency(
    summary: &DifficultyAssessment,
    highest: Option<Technique>,
) -> CoreResult<()> {
    let workload = &summary.workload;
    let highest_tier = highest.map(technique_tier);
    let difficulty_matches_highest = match highest_tier {
        Some(tier) => tier == summary.difficulty,
        None => summary.difficulty == Difficulty::Easy,
    };

    if workload.highest_technique != highest
        || workload.highest_tier != highest_tier
        || !difficulty_matches_highest
    {
        return Err(EngineError::invalid("Contradictory assessment workload"));
    }

    Ok(())
}

/// Validate an untrusted summary and return an owned copy without regrading its puzzle.
pub fn validate_summary(summary: &DifficultyAssessment) -> CoreResult<DifficultyAssessment> {
    if !supports_difficulty(summary.variant, summary.difficulty) {
        return Err(EngineError::invalid("Invalid assessment summary identity"));
    }

    // Keep boundary error precedence: identity, safe counts, applicable techniques, then contradictions.
    validate_count_bounds(&summary.workload)?;
    let accounting = summarize_technique_counts(summary)?;
    validate_action_accounting(&summary.workload, summary.variant, &accounting)?;
    validate_technique_consistency(summary, accounting.highest)?;

    Ok(summary.clone())
}

/// Preserve absent, unavailable and rated facts independently of the playable puzzle content.
pub fn decode_puzzle_assessment(
    value: Option<&StoredAssessment>,
    identity: AssessmentIdentity,
) -> Option<PuzzleAssessment> {
    let value = value?;
    let unavailable = |reason, issues| Some(PuzzleAssessment::Unavailable { reason, issues });
    match value {
        StoredAssessment::Unavailable { reason, issues }
            if issues.iter().all(|issue| !issue.trim().is_empty()) =>
        {
            unavailable(*reason, issues.clone())
        }
        StoredAssessment::Rated { rating_version, .. } if rating_version != RATING_VERSION => {
            unavailable(
                UnavailableReason::UnsupportedVersion,
                vec!["Unsupported rating version".to_string()],
            )
        }
        StoredAssessment::Rated { summary, .. } => {
            match summary.as_ref().map_err(Clone::clone).and_then(|summary| {
                validate_summary(summary).map_err(|error| match error {
                    EngineError::InvalidInput(issues) => issues,
                    error => vec![error.to_string()],
                })
            }) {
                Ok(summary)
                    if summary.variant == identity.variant
                        && summary.difficulty == identity.difficulty =>
                {
                    Some(PuzzleAssessment::Rated(summary))
                }
                Ok(_) => unavailable(
                    UnavailableReason::IdentityMismatch,
                    vec!["Assessment does not match puzzle type or difficulty".to_string()],
                ),
                Err(issues) => unavailable(UnavailableReason::InvalidSummary, issues),
            }
        }
        StoredAssessment::OtherOutcome => unavailable(
            UnavailableReason::InvalidSummary,
            vec!["Expected puzzle assessment metadata".to_string()],
        ),
        StoredAssessment::Malformed { issues } => {
            unavailable(UnavailableReason::InvalidSummary, issues.clone())
        }
        StoredAssessment::Unavailable { .. } => unavailable(
            UnavailableReason::InvalidSummary,
            vec!["Invalid assessment outcome identity".to_string()],
        ),
    }
}
