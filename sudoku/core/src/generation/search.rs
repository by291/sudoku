//! Own one bounded generation request; a layout retires with its preparation and clue frontier.
use super::candidates::{
    ACTIVE_LAYOUTS, CandidateCheckpoint, CandidateFrontier, CheckpointStatus, GivenMask,
    STAGNATION_LIMIT, SolvedExact, StalledExact,
};
use super::layouts::construct_generation_layout;
use super::random::{RandomPhase, for_phase};
use super::types::{
    GeneratedPuzzle, GenerationExhaustionCause, GenerationInput, GenerationLimits,
    GenerationMetrics, GenerationOutcome, LayoutConstructionResult,
};
use super::variant::variant_rules_matter;
use crate::board::{KnownCompletion, is_complete};
use crate::constraints::computation::prepare_computation;
use crate::constraints::types::PreparedComputation;
use crate::control::ExecutionControl;
use crate::puzzle::Puzzle;
use crate::rating::assessment::{WitnessedTarget, prepare_assessment_with_computation};
use crate::rating::types::{
    AssessmentIssue, AssessmentLimits, DifficultyAssessment, ExhaustionCause, PreparedAssessment,
    RatedTrial, TargetScreenResult,
};
use crate::rules::types::SudokuVariant;
use crate::search::exact::{CompletionSearch, count_solutions, count_with_completion};
use crate::search::types::SearchResult;
use crate::types::{Board, Bounded, CoreResult, Difficulty};

const EASY_CLUE_TARGET: usize = 36;
const MEDIUM_CLUE_TARGET: usize = 32;
const HARD_CLUE_TARGET: usize = 30;
const EXPERT_CLUE_TARGET: usize = 28;

pub(super) struct GenerationSearch<'a> {
    pub(super) input: &'a GenerationInput,
    pub(super) limits: &'a GenerationLimits,
    pub(super) metrics: &'a mut GenerationMetrics,
    pub(super) control: &'a mut ExecutionControl,
}

struct ActiveLayout {
    id: u32,
    terminal: Board,
    completion: KnownCompletion,
    computation: PreparedComputation,
    assessor: PreparedAssessment,
    frontier: CandidateFrontier,
    visits: u32,
    expanded_at: u32,
    best_tier: u8,
    best_progress: usize,
}

enum ScreeningOutcome {
    NotScreened,
    Completed,
    StepLimited,
}

struct AcceptedCandidate {
    puzzle: Box<GeneratedPuzzle>,
    assessment: Box<DifficultyAssessment>,
}

enum CandidateEvaluation {
    Continue {
        improved: bool,
        screening: ScreeningOutcome,
    },
    Accepted(AcceptedCandidate),
    Failed {
        reason: String,
    },
    Cancelled,
}

enum Acceptance {
    Accepted(AcceptedCandidate),
    Failed { reason: String },
    Rejected,
    Cancelled,
}

enum LayoutPreparation {
    Ready(Box<ActiveLayout>),
    AttemptExhausted,
    Cancelled,
    Failed { reason: String },
}

struct CandidateAcceptance<'a> {
    layout: &'a ActiveLayout,
    board: Board,
    trial: RatedTrial,
    input: &'a GenerationInput,
    control: &'a mut ExecutionControl,
}

struct CandidateWork<'a> {
    layout: &'a mut ActiveLayout,
    input: &'a GenerationInput,
    control: &'a mut ExecutionControl,
}

struct LayoutAttempt<'a> {
    id: u32,
    input: &'a GenerationInput,
    limits: &'a GenerationLimits,
    control: &'a mut ExecutionControl,
}

fn clue_target(difficulty: Difficulty) -> usize {
    match difficulty {
        Difficulty::Easy => EASY_CLUE_TARGET,
        Difficulty::Medium => MEDIUM_CLUE_TARGET,
        Difficulty::Hard => HARD_CLUE_TARGET,
        Difficulty::Expert => EXPERT_CLUE_TARGET,
    }
}

fn should_screen_first(input: &GenerationInput) -> bool {
    input.variant == SudokuVariant::Killer && input.difficulty == Difficulty::Hard
}

fn meets_clue_policy(input: &GenerationInput, board: &Board) -> bool {
    if input.variant != SudokuVariant::Classic {
        return true;
    }

    let cells = board.values();
    let clues = cells.iter().filter(|&&digit| digit != 0).count();
    clues <= clue_target(input.difficulty)
}

fn try_accept_candidate(acceptance: CandidateAcceptance<'_>) -> CoreResult<Acceptance> {
    let CandidateAcceptance {
        layout,
        board,
        trial,
        input,
        control,
    } = acceptance;

    if !meets_clue_policy(input, &board) {
        return Ok(Acceptance::Rejected);
    }

    let rules = layout.computation.rules();
    let mut clue_pairs = board.values().iter().zip(layout.terminal.values());
    let has_mismatched_clues =
        clue_pairs.any(|(&digit, &terminal)| digit != 0 && digit != terminal);
    if rules.rules().variant() != input.variant
        || has_mismatched_clues
        || !is_complete(&layout.terminal, rules)
    {
        return Ok(Acceptance::Failed {
            reason: "Invalid constructed puzzle identity or terminal".to_string(),
        });
    }

    let completed = trial.complete()?;
    if completed.summary.variant != input.variant
        || completed.summary.difficulty != input.difficulty
    {
        return Ok(Acceptance::Failed {
            reason: "Accepted assessment identity does not match the request".to_string(),
        });
    }

    let exact = count_solutions(&board, &layout.computation, control, u64::MAX);
    let SearchResult::Complete {
        count, solution, ..
    } = exact
    else {
        return Ok(Acceptance::Cancelled);
    };

    // The known completion makes zero solutions or a different unique solution an invariant
    // failure.
    if count == 0 || (count == 1 && solution.as_ref() != Some(&layout.terminal)) {
        return Ok(Acceptance::Failed {
            reason: "Constructed terminal lost its known solution".to_string(),
        });
    }
    if count != 1 {
        return Ok(Acceptance::Rejected);
    }

    let content = Puzzle {
        rules: layout.computation.rules().rules().clone(),
        solution: layout.terminal.clone(),
        givens: board,
        difficulty: input.difficulty,
    };

    // Variant rules must affect the puzzle independently of the variant uniqueness check.
    if input.variant != SudokuVariant::Classic {
        let Bounded::Complete(matters) = variant_rules_matter(&content, control)? else {
            return Ok(Acceptance::Cancelled);
        };
        if !matters {
            return Ok(Acceptance::Rejected);
        }
    }

    Ok(Acceptance::Accepted(AcceptedCandidate {
        puzzle: Box::new(GeneratedPuzzle {
            content,
            seed: input.seed,
            puzzle_version: input.puzzle_version,
        }),
        assessment: Box::new(completed.summary),
    }))
}

fn evaluate_candidate(mask: GivenMask, work: CandidateWork<'_>) -> CoreResult<CandidateEvaluation> {
    let CandidateWork {
        layout,
        input,
        control,
    } = work;

    let board = mask.materialize(&layout.terminal)?;

    let mut exact = SolvedExact::Unchecked;
    // Killer Hard screens logic first, so retained checkpoints may have unchecked uniqueness.
    if !should_screen_first(input) {
        let SearchResult::Complete { count, .. } = count_with_completion(
            CompletionSearch {
                board: &board,
                computation: &layout.computation,
                completion: &layout.completion,
                node_limit: u64::MAX,
            },
            control,
        )?
        else {
            return Ok(CandidateEvaluation::Cancelled);
        };
        if count == 0 {
            return Ok(CandidateEvaluation::Failed {
                reason: "Constructed terminal lost its known solution".to_string(),
            });
        }
        if count != 1 {
            return Ok(CandidateEvaluation::Continue {
                improved: false,
                screening: ScreeningOutcome::NotScreened,
            });
        }
        exact = SolvedExact::Unique;
    }

    let trial = layout.assessor.screen_target_with_completion(
        WitnessedTarget {
            board: &board,
            difficulty: input.difficulty,
            completion: &layout.completion,
        },
        control,
    );
    let (trial, feedback, matching) = match trial {
        TargetScreenResult::Invalid { issues } => {
            let messages = issues
                .iter()
                .map(|issue| match issue {
                    AssessmentIssue::Message(message) => message.clone(),
                    AssessmentIssue::Violation(violation) => {
                        format!("{}: {:?}", violation.constraint_id, violation.code)
                    }
                })
                .collect::<Vec<_>>();
            let reason = messages.join("; ");
            return Ok(CandidateEvaluation::Failed { reason });
        }
        TargetScreenResult::Incomplete {
            cause: ExhaustionCause::Cancelled,
        } => return Ok(CandidateEvaluation::Cancelled),
        TargetScreenResult::Incomplete {
            cause: ExhaustionCause::LogicalStepLimit,
        } => {
            return Ok(CandidateEvaluation::Continue {
                improved: false,
                screening: ScreeningOutcome::StepLimited,
            });
        }
        TargetScreenResult::TargetStalled { feedback } => {
            let exact = match exact {
                SolvedExact::Unique => StalledExact::Unique,
                SolvedExact::Unchecked => StalledExact::Unknown,
            };
            let improved = layout.frontier.retain(CandidateCheckpoint {
                layout_id: layout.id,
                mask,
                feedback,
                status: CheckpointStatus::Stalled { exact },
            })?;
            return Ok(CandidateEvaluation::Continue {
                improved,
                screening: ScreeningOutcome::Completed,
            });
        }
        TargetScreenResult::BelowTarget { trial, feedback } => (trial, feedback, false),
        TargetScreenResult::MatchingTarget { trial, feedback } => (trial, feedback, true),
    };

    let difficulty = trial.difficulty();
    let improved = layout.frontier.retain(CandidateCheckpoint {
        layout_id: layout.id,
        mask,
        feedback,
        status: CheckpointStatus::Solved { difficulty, exact },
    })?;

    let tier = difficulty.rank();
    let cells = board.values();
    let progress = cells.iter().filter(|&&digit| digit == 0).count();
    if tier > layout.best_tier || (tier == layout.best_tier && progress > layout.best_progress) {
        layout.best_tier = tier;
        layout.best_progress = progress;
    }

    if matching && meets_clue_policy(input, &board) {
        match try_accept_candidate(CandidateAcceptance {
            layout,
            board,
            trial,
            input,
            control,
        })? {
            Acceptance::Accepted(candidate) => return Ok(CandidateEvaluation::Accepted(candidate)),
            Acceptance::Failed { reason } => return Ok(CandidateEvaluation::Failed { reason }),
            Acceptance::Cancelled => return Ok(CandidateEvaluation::Cancelled),
            Acceptance::Rejected => {}
        }
    }

    Ok(CandidateEvaluation::Continue {
        improved,
        screening: ScreeningOutcome::Completed,
    })
}

fn prepare_layout(attempt: LayoutAttempt<'_>) -> CoreResult<LayoutPreparation> {
    let LayoutAttempt {
        id,
        input,
        limits,
        control,
    } = attempt;

    let mut terminal_random = for_phase(input, RandomPhase::Terminal, id, 0);
    let mut geometry_random = for_phase(input, RandomPhase::Geometry, id, 0);
    let constructed =
        construct_generation_layout(input, &mut terminal_random, &mut geometry_random, control)?;
    let (terminal, rules) = match constructed {
        LayoutConstructionResult::Incomplete => {
            return Ok(LayoutPreparation::Cancelled);
        }
        LayoutConstructionResult::Failed { reason } => {
            return Ok(LayoutPreparation::Failed { reason });
        }
        LayoutConstructionResult::AttemptExhausted => {
            return Ok(LayoutPreparation::AttemptExhausted);
        }
        LayoutConstructionResult::Ready { terminal, rules } => (terminal, rules),
    };

    let Bounded::Complete(computation) = prepare_computation(&rules, control)? else {
        return Ok(LayoutPreparation::Cancelled);
    };
    if rules.variant() != input.variant || !is_complete(&terminal, computation.rules()) {
        return Ok(LayoutPreparation::Failed {
            reason: "Constructed layout has an invalid terminal".to_string(),
        });
    }

    let mut frontier = CandidateFrontier::new(id, &terminal, input.difficulty)?;
    frontier.retain(CandidateCheckpoint {
        layout_id: id,
        mask: GivenMask::from_board(&terminal),
        status: CheckpointStatus::Solved {
            difficulty: Difficulty::Easy,
            exact: SolvedExact::Unchecked,
        },
        feedback: crate::rating::types::TargetFeedback {
            remaining_cells: 0,
            deductions: 0,
        },
    })?;

    let assessor = prepare_assessment_with_computation(
        &computation,
        AssessmentLimits {
            max_steps: limits.max_steps,
        },
    )?;
    let completion = KnownCompletion::new(&terminal, computation.rules())?;

    let layout = ActiveLayout {
        id,
        terminal,
        completion,
        computation,
        assessor,
        frontier,
        visits: 0,
        expanded_at: 0,
        best_tier: 0,
        best_progress: 0,
    };

    Ok(LayoutPreparation::Ready(Box::new(layout)))
}

// Keep selection and evaluation in the owner's scheduled work, including abandoned edits.
fn execute_proposal(
    work: CandidateWork<'_>,
    metrics: &mut GenerationMetrics,
) -> CoreResult<Option<CandidateEvaluation>> {
    let CandidateWork {
        layout,
        input,
        control,
    } = work;

    let mut random = for_phase(input, RandomPhase::Candidate, layout.id, layout.visits);
    let proposal = layout.frontier.next(&mut random, control);
    let Some(proposal) = proposal else {
        return Ok(None);
    };

    layout.visits += 1;
    metrics.candidate_visits += 1;
    let result = evaluate_candidate(
        proposal.mask,
        CandidateWork {
            layout,
            input,
            control,
        },
    )?;

    Ok(Some(result))
}

fn retire_layout_for_expansion(
    active: &mut Vec<ActiveLayout>,
    expansion_requested_by: &mut Option<u32>,
) {
    if active.len() < ACTIVE_LAYOUTS {
        return;
    }

    active.sort_by(|left, right| {
        left.best_tier
            .cmp(&right.best_tier)
            .then_with(|| left.best_progress.cmp(&right.best_progress))
            .then_with(|| right.id.cmp(&left.id))
    });
    let retired = active.remove(0);
    if Some(retired.id) == *expansion_requested_by {
        *expansion_requested_by = None;
    }
}

/// Search layouts and their clue frontiers within the request limits.
pub(super) fn search_generation(search: GenerationSearch<'_>) -> CoreResult<GenerationOutcome> {
    let GenerationSearch {
        input,
        limits,
        metrics,
        control,
    } = search;

    let mut active: Vec<ActiveLayout> = vec![];

    // Stable owner IDs survive sorting and removal without sharing mutable layout state.
    let mut expansion_requested_by = None;
    let mut logical_screens = 0;
    let mut step_limited_screens = 0;
    let mut cancelled = false;

    while control.check() {
        active.retain(|layout| !layout.frontier.exhausted());
        if expansion_requested_by.is_some_and(|id| !active.iter().any(|layout| layout.id == id)) {
            expansion_requested_by = None;
        }

        // Expansion eligibility must not preempt an owner that is still improving.
        let can_expand = expansion_requested_by.is_some()
            && (active.len() < ACTIVE_LAYOUTS
                || active.iter().all(|layout| layout.frontier.stagnant()));
        if (active.is_empty() || can_expand) && metrics.layouts < limits.max_layouts {
            retire_layout_for_expansion(&mut active, &mut expansion_requested_by);

            // Failed terminal/geometry attempts consume a layout slot; candidate edits do not.
            let id = metrics.layouts;
            metrics.layouts += 1;
            let layout = match prepare_layout(LayoutAttempt {
                id,
                input,
                limits,
                control,
            })? {
                LayoutPreparation::Ready(layout) => *layout,
                LayoutPreparation::AttemptExhausted => continue,
                LayoutPreparation::Cancelled => {
                    cancelled = true;
                    break;
                }
                LayoutPreparation::Failed { reason } => {
                    return Ok(GenerationOutcome::Failed { reason });
                }
            };

            metrics.completed_layouts += 1;
            if let Some(owner) = expansion_requested_by
                .take()
                .and_then(|requested| active.iter_mut().find(|owner| owner.id == requested))
            {
                owner.expanded_at = owner.visits;
            }
            active.push(layout);
        }

        if active.is_empty() {
            break;
        }

        // Visit count and stable IDs determine scheduling independently of host timing.
        active.sort_by(|left, right| {
            left.visits
                .cmp(&right.visits)
                .then_with(|| left.id.cmp(&right.id))
        });
        let layout = &mut active[0];
        let work = CandidateWork {
            layout,
            input,
            control,
        };
        let Some(result) = execute_proposal(work, metrics)? else {
            if control.is_cancelled() {
                break;
            }
            continue;
        };

        let (improved, screening) = match result {
            CandidateEvaluation::Accepted(candidate) => {
                return Ok(GenerationOutcome::Ready {
                    puzzle: candidate.puzzle,
                    assessment: candidate.assessment,
                });
            }
            CandidateEvaluation::Failed { reason } => {
                return Ok(GenerationOutcome::Failed { reason });
            }
            CandidateEvaluation::Cancelled => {
                cancelled = true;
                break;
            }
            CandidateEvaluation::Continue {
                improved,
                screening,
            } => (improved, screening),
        };

        match screening {
            ScreeningOutcome::NotScreened => {}
            ScreeningOutcome::Completed => logical_screens += 1,
            ScreeningOutcome::StepLimited => {
                logical_screens += 1;
                step_limited_screens += 1;
            }
        }

        layout.frontier.record_evaluation(improved);

        // A previous expansion must be followed by another full stagnation window.
        if layout.frontier.stagnant()
            && layout.visits - layout.expanded_at >= STAGNATION_LIMIT as u32
        {
            expansion_requested_by = Some(layout.id);
        }
    }

    // Report the logical budget only when it stopped every executed screen.
    let cause = if cancelled || control.is_cancelled() {
        GenerationExhaustionCause::Cancelled
    } else if step_limited_screens > 0 && step_limited_screens == logical_screens {
        GenerationExhaustionCause::LogicalStepLimit
    } else if metrics.layouts >= limits.max_layouts {
        GenerationExhaustionCause::LayoutLimit
    } else {
        GenerationExhaustionCause::ExhaustedFrontier
    };

    Ok(GenerationOutcome::Incomplete { cause })
}
