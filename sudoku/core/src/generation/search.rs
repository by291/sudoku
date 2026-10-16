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
use crate::board::is_complete;
use crate::budget::{WorkBudget, WorkStage};
use crate::constraints::computation::prepare_computation;
use crate::constraints::types::PreparedComputation;
use crate::puzzle::Puzzle;
use crate::rating::assessment::prepare_assessment_with_computation;
use crate::rating::types::{
    AssessmentIssue, AssessmentLimits, ExhaustionCause, PreparedAssessment, RatedTrial,
    TargetScreenResult,
};
use crate::rules::types::SudokuVariant;
use crate::search::exact::count_solutions;
use crate::search::types::SearchResult;
use crate::types::{Board, Bounded, CoreResult, Difficulty};

struct ActiveLayout {
    id: u32,
    terminal: Board,
    computation: PreparedComputation,
    assessor: PreparedAssessment,
    frontier: CandidateFrontier,
    visits: u32,
    expanded_at: u32,
    work_used: u64,
    best_tier: u8,
    best_progress: usize,
}

enum CandidateEvaluation {
    Continue {
        improved: bool,
        step_limited: bool,
        screened: bool,
    },
    Finished(GenerationOutcome),
    WorkLimit,
}

enum Acceptance {
    Accepted(GenerationOutcome),
    Rejected,
    WorkLimit,
}

fn clue_target(difficulty: Difficulty) -> usize {
    match difficulty {
        Difficulty::Easy => 36,
        Difficulty::Medium => 32,
        Difficulty::Hard => 30,
        Difficulty::Expert => 28,
    }
}

fn screening_first(input: &GenerationInput) -> bool {
    input.variant == SudokuVariant::Killer && input.difficulty == Difficulty::Hard
}

fn meets_clue_policy(input: &GenerationInput, board: &Board) -> bool {
    input.variant != SudokuVariant::Classic
        || board.values().iter().filter(|&&digit| digit != 0).count()
            <= clue_target(input.difficulty)
}

fn failed(reason: &str) -> CandidateEvaluation {
    CandidateEvaluation::Finished(GenerationOutcome::Failed {
        reason: reason.to_string(),
    })
}

fn accepted_candidate(
    layout: &ActiveLayout,
    board: Board,
    trial: RatedTrial,
    input: &GenerationInput,
    budget: &mut WorkBudget,
) -> CoreResult<Acceptance> {
    if !meets_clue_policy(input, &board) {
        return Ok(Acceptance::Rejected);
    }
    if layout.computation.rules().rules().variant() != input.variant
        || board
            .values()
            .iter()
            .zip(layout.terminal.values())
            .any(|(&digit, &terminal)| digit != 0 && digit != terminal)
        || !is_complete(&layout.terminal, layout.computation.rules())
    {
        return Ok(Acceptance::Accepted(GenerationOutcome::Failed {
            reason: "Invalid constructed puzzle identity or terminal".to_string(),
        }));
    }

    let completed = trial.complete()?;
    if completed.summary.variant != input.variant
        || completed.summary.difficulty != input.difficulty
    {
        return Ok(Acceptance::Accepted(GenerationOutcome::Failed {
            reason: "Accepted assessment identity does not match the request".to_string(),
        }));
    }

    let exact = count_solutions(&board, &layout.computation, budget, budget.remaining());
    let SearchResult::Complete {
        count, solution, ..
    } = exact
    else {
        return Ok(Acceptance::WorkLimit);
    };
    if count == 0 || (count == 1 && solution.as_ref() != Some(&layout.terminal)) {
        return Ok(Acceptance::Accepted(GenerationOutcome::Failed {
            reason: "Constructed terminal lost its known solution".to_string(),
        }));
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
    if input.variant != SudokuVariant::Classic {
        let Bounded::Complete(matters) = variant_rules_matter(&content, budget)? else {
            return Ok(Acceptance::WorkLimit);
        };
        if !matters {
            return Ok(Acceptance::Rejected);
        }
    }
    Ok(Acceptance::Accepted(GenerationOutcome::Ready {
        puzzle: Box::new(GeneratedPuzzle {
            content,
            seed: input.seed,
            puzzle_version: input.puzzle_version,
        }),
        assessment: Box::new(completed.summary),
    }))
}

fn evaluate_candidate(
    layout: &mut ActiveLayout,
    mask: GivenMask,
    input: &GenerationInput,
    budget: &mut WorkBudget,
) -> CoreResult<CandidateEvaluation> {
    let board = mask.materialize(&layout.terminal)?;
    let mut exact = SolvedExact::Unchecked;
    if !screening_first(input) {
        let SearchResult::Complete { count, .. } =
            count_solutions(&board, &layout.computation, budget, budget.remaining())
        else {
            return Ok(CandidateEvaluation::WorkLimit);
        };
        if count == 0 {
            return Ok(failed("Constructed terminal lost its known solution"));
        }
        if count != 1 {
            return Ok(CandidateEvaluation::Continue {
                improved: false,
                step_limited: false,
                screened: false,
            });
        }
        exact = SolvedExact::Unique;
    }

    let trial = layout
        .assessor
        .screen_target(&board, input.difficulty, budget);
    let (trial, feedback, matching) = match trial {
        TargetScreenResult::Invalid { issues } => {
            let reason = issues
                .iter()
                .map(|issue| match issue {
                    AssessmentIssue::Message(message) => message.clone(),
                    AssessmentIssue::Violation(violation) => {
                        format!("{}: {:?}", violation.constraint_id, violation.code)
                    }
                })
                .collect::<Vec<_>>()
                .join("; ");
            return Ok(CandidateEvaluation::Finished(GenerationOutcome::Failed {
                reason,
            }));
        }
        TargetScreenResult::BudgetExhausted {
            cause: ExhaustionCause::WorkLimit,
        } => return Ok(CandidateEvaluation::WorkLimit),
        TargetScreenResult::BudgetExhausted {
            cause: ExhaustionCause::LogicalStepLimit,
        } => {
            return Ok(CandidateEvaluation::Continue {
                improved: false,
                step_limited: true,
                screened: true,
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
                step_limited: false,
                screened: true,
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
    let progress = board.values().iter().filter(|&&digit| digit == 0).count();
    if tier > layout.best_tier || (tier == layout.best_tier && progress > layout.best_progress) {
        layout.best_tier = tier;
        layout.best_progress = progress;
    }
    if matching && meets_clue_policy(input, &board) {
        match accepted_candidate(layout, board, trial, input, budget)? {
            Acceptance::Accepted(result) => return Ok(CandidateEvaluation::Finished(result)),
            Acceptance::WorkLimit => return Ok(CandidateEvaluation::WorkLimit),
            Acceptance::Rejected => {}
        }
    }
    Ok(CandidateEvaluation::Continue {
        improved,
        step_limited: false,
        screened: true,
    })
}

pub(super) fn search_generation(
    input: &GenerationInput,
    limits: &GenerationLimits,
    metrics: &mut GenerationMetrics,
    budget: &mut WorkBudget,
) -> CoreResult<GenerationOutcome> {
    let mut active: Vec<ActiveLayout> = vec![];
    // Stable owner IDs survive sorting and removal without sharing mutable layout state.
    let mut expansion_requested_by = None;
    let mut logical_screens = 0;
    let mut step_limited_screens = 0;
    let mut work_exhausted = false;
    while budget.remaining() > 0 && !budget.is_cancelled() {
        active.retain(|layout| !layout.frontier.exhausted());
        if expansion_requested_by.is_some_and(|id| !active.iter().any(|layout| layout.id == id)) {
            expansion_requested_by = None;
        }
        // Expansion eligibility must not preempt an owner that is still improving.
        let can_expand = expansion_requested_by.is_some()
            && (active.len() < ACTIVE_LAYOUTS
                || active.iter().all(|layout| layout.frontier.stagnant()));
        if (active.is_empty() || can_expand) && metrics.layouts < limits.max_layouts {
            if active.len() >= ACTIVE_LAYOUTS {
                active.sort_by(|left, right| {
                    left.best_tier
                        .cmp(&right.best_tier)
                        .then_with(|| left.best_progress.cmp(&right.best_progress))
                        .then_with(|| right.id.cmp(&left.id))
                });
                let retired = active.remove(0);
                if Some(retired.id) == expansion_requested_by {
                    expansion_requested_by = None;
                }
            }
            // Failed terminal/geometry attempts consume a layout slot; candidate edits do not.
            let layout_started = budget.used();
            let id = metrics.layouts;
            metrics.layouts += 1;
            let mut terminal_random = for_phase(input, RandomPhase::Terminal, id, 0);
            let mut geometry_random = for_phase(input, RandomPhase::Geometry, id, 0);
            let constructed = budget.with_stage(WorkStage::Preparation, |budget| {
                construct_generation_layout(
                    input,
                    &mut terminal_random,
                    &mut geometry_random,
                    budget,
                )
            })?;
            let (terminal, rules) = match constructed {
                LayoutConstructionResult::BudgetExhausted => {
                    work_exhausted = true;
                    break;
                }
                LayoutConstructionResult::Failed { reason } => {
                    return Ok(GenerationOutcome::Failed { reason });
                }
                LayoutConstructionResult::AttemptExhausted => continue,
                LayoutConstructionResult::Ready { terminal, rules } => (terminal, rules),
            };
            let Bounded::Complete(computation) = prepare_computation(&rules, budget)? else {
                work_exhausted = true;
                break;
            };
            if rules.variant() != input.variant || !is_complete(&terminal, computation.rules()) {
                return Ok(GenerationOutcome::Failed {
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
                    max_work: limits.max_work,
                },
            )?;
            let layout = ActiveLayout {
                id,
                terminal,
                computation,
                assessor,
                frontier,
                visits: 0,
                expanded_at: 0,
                work_used: budget.used() - layout_started,
                best_tier: 0,
                best_progress: 0,
            };
            metrics.completed_layouts += 1;
            if let Some(requested) = expansion_requested_by {
                if let Some(owner) = active.iter_mut().find(|owner| owner.id == requested) {
                    owner.expanded_at = owner.visits;
                }
                expansion_requested_by = None;
            }
            active.push(layout);
        }
        if active.is_empty() {
            break;
        }

        // Equal calls can cost very different work; give the least-served owner the next turn.
        active.sort_by(|left, right| {
            left.work_used
                .cmp(&right.work_used)
                .then_with(|| left.id.cmp(&right.id))
        });
        let layout = &mut active[0];
        let proposal_started = budget.used();
        let mut random = for_phase(input, RandomPhase::Candidate, layout.id, layout.visits);
        let proposal = layout.frontier.next(&mut random, budget);
        layout.work_used += budget.used() - proposal_started;
        let Some(proposal) = proposal else {
            if budget.remaining() == 0 {
                break;
            }
            continue;
        };
        layout.visits += 1;
        metrics.candidate_visits += 1;
        let evaluation_started = budget.used();
        let result = evaluate_candidate(layout, proposal.mask, input, budget)?;
        layout.work_used += budget.used() - evaluation_started;
        let (improved, step_limited, screened) = match result {
            CandidateEvaluation::Finished(result) => return Ok(result),
            CandidateEvaluation::WorkLimit => {
                work_exhausted = true;
                break;
            }
            CandidateEvaluation::Continue {
                improved,
                step_limited,
                screened,
            } => (improved, step_limited, screened),
        };
        if screened {
            logical_screens += 1;
            if step_limited {
                step_limited_screens += 1;
            }
        }
        layout.frontier.record_evaluation(improved);
        if layout.frontier.stagnant()
            && layout.visits - layout.expanded_at >= STAGNATION_LIMIT as u32
        {
            expansion_requested_by = Some(layout.id);
        }
    }

    let cause = if work_exhausted || budget.remaining() == 0 {
        GenerationExhaustionCause::WorkLimit
    } else if step_limited_screens > 0 && step_limited_screens == logical_screens {
        GenerationExhaustionCause::LogicalStepLimit
    } else if metrics.layouts >= limits.max_layouts {
        GenerationExhaustionCause::LayoutLimit
    } else {
        GenerationExhaustionCause::ExhaustedFrontier
    };
    Ok(GenerationOutcome::BudgetExhausted { cause })
}
