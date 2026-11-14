use std::cell::OnceCell;

use super::input::validate_rating_version;
use super::policies::{policy_slice, supported_difficulties, supports_difficulty};
use super::types::{
    AssessmentFailure, AssessmentIssue, AssessmentResult, AssessmentStage, DifficultyAssessment,
    ExhaustionCause, PreparedAssessment, RatedAssessment, RatedTrial, TargetFeedback,
    TargetScreenResult, TrialAssessmentResult,
};
use super::types::{AssessmentInput, AssessmentLimits};
use super::workload::summarize_trace;
use crate::board::KnownCompletion;
use crate::constraints::computation::prepare_computation;
use crate::constraints::conflicts::evaluate_prepared_conflicts;
use crate::constraints::types::{ConflictStatus, PreparedComputation};
use crate::control::ExecutionControl;
use crate::logic::solver::{LogicContinuation, analyze_workspace_owned};
use crate::logic::techniques::{Technique, execution_order};
use crate::logic::types::{LogicStatus, LogicalStep};
use crate::logic::workspace::create_prepared_workspace;
use crate::rules::context::validate_rules;
use crate::rules::types::PuzzleRules;
use crate::types::{Board, Bounded, CoreResult, Difficulty, EngineError};

/// Validate and own inputs now; defer expensive layout preparation until the first evaluation.
pub fn prepare_assessment(
    rules: &PuzzleRules,
    limits: AssessmentLimits,
) -> CoreResult<PreparedAssessment> {
    validate_rules(rules)?;
    limits.validate()?;

    Ok(PreparedAssessment {
        rules: rules.clone(),
        limits,
        computation: OnceCell::new(),
    })
}

/// Share an already prepared immutable layout while keeping all assessment workspaces local.
pub fn prepare_assessment_with_computation(
    computation: &PreparedComputation,
    limits: AssessmentLimits,
) -> CoreResult<PreparedAssessment> {
    limits.validate()?;

    Ok(PreparedAssessment {
        rules: computation.rules().rules().clone(),
        limits,
        computation: OnceCell::from(computation.clone()),
    })
}

/// Rate the board with the configured step limit and without a host cancellation probe.
pub fn assess_puzzle(input: &AssessmentInput) -> AssessmentResult {
    assess_puzzle_with_control(input, &mut ExecutionControl::new())
}

/// Rate the board while sharing the caller's cancellation signal across all policies.
pub fn assess_puzzle_with_control(
    input: &AssessmentInput,
    control: &mut ExecutionControl,
) -> AssessmentResult {
    let prepared = validate_rating_version(input)
        .and_then(|()| prepare_assessment(&input.rules, input.limits));

    match prepared {
        Ok(owner) => owner.assess(&input.board, control),
        Err(error) => AssessmentResult::Unrated(AssessmentFailure::Invalid {
            issues: message(error.to_string()),
        }),
    }
}

enum PolicyScreen {
    Rated {
        trial: RatedTrial,
        feedback: TargetFeedback,
    },
    Stalled(TargetFeedback),
    Exhausted {
        cause: ExhaustionCause,
        stage: AssessmentStage,
        difficulty: Option<Difficulty>,
    },
    Invalid(Vec<AssessmentIssue>),
}

pub(crate) struct WitnessedTarget<'layout> {
    pub board: &'layout Board,
    pub difficulty: Difficulty,
    pub completion: &'layout KnownCompletion,
}

struct PolicyEvaluation<'request> {
    board: &'request Board,
    control: &'request mut ExecutionControl,
    target: Option<Difficulty>,
    completion: Option<&'request KnownCompletion>,
}

struct PolicyScreenRequest<'request, Policies> {
    evaluation: PolicyEvaluation<'request>,
    limits: AssessmentLimits,
    computation: &'request PreparedComputation,
    policies: Policies,
}

enum BoardValidation {
    Valid,
    Invalid(Vec<AssessmentIssue>),
    Cancelled,
}

fn message(value: impl Into<String>) -> Vec<AssessmentIssue> {
    vec![AssessmentIssue::Message(value.into())]
}

impl PreparedAssessment {
    fn prepared(
        &self,
        control: &mut ExecutionControl,
    ) -> CoreResult<Bounded<&PreparedComputation>> {
        if let Some(computation) = self.computation.get() {
            return Ok(Bounded::Complete(computation));
        }

        let Bounded::Complete(computation) = prepare_computation(&self.rules, control)? else {
            return Ok(Bounded::Cancelled);
        };

        self.computation
            .set(computation)
            .map_err(|_| EngineError::invalid("Assessment preparation was already initialized"))?;

        self.computation
            .get()
            .map(Bounded::Complete)
            .ok_or_else(|| EngineError::invalid("Assessment preparation was not retained"))
    }

    fn evaluate(&self, evaluation: PolicyEvaluation<'_>) -> PolicyScreen {
        let variant = self.rules.variant();
        if evaluation
            .target
            .is_some_and(|target| !supports_difficulty(variant, target))
        {
            return PolicyScreen::Invalid(message("Unsupported assessment target"));
        }

        let computation = match self.prepared(evaluation.control) {
            Ok(Bounded::Complete(computation)) => computation,
            Ok(Bounded::Cancelled) => {
                return PolicyScreen::Exhausted {
                    cause: ExhaustionCause::Cancelled,
                    stage: AssessmentStage::Validation,
                    difficulty: None,
                };
            }
            Err(error) => return PolicyScreen::Invalid(message(error.to_string())),
        };

        let policies = supported_difficulties(variant)
            .iter()
            .map(|&difficulty| (difficulty, policy_slice(variant, difficulty)));

        screen_policies(PolicyScreenRequest {
            evaluation,
            limits: self.limits,
            computation,
            policies,
        })
    }

    /// Find the first solving policy and return its owned trial for later workload accounting.
    pub fn screen(&self, board: &Board, control: &mut ExecutionControl) -> TrialAssessmentResult {
        let variant = self.rules.variant();
        let evaluation = PolicyEvaluation {
            board,
            control,
            target: None,
            completion: None,
        };

        match self.evaluate(evaluation) {
            PolicyScreen::Rated { trial, .. } => TrialAssessmentResult::Rated(trial),
            PolicyScreen::Stalled(_) => {
                TrialAssessmentResult::Unrated(AssessmentFailure::Ungraded { variant })
            }
            PolicyScreen::Exhausted {
                stage, difficulty, ..
            } => TrialAssessmentResult::Unrated(AssessmentFailure::Incomplete {
                variant,
                stage,
                difficulty,
            }),
            PolicyScreen::Invalid(issues) => {
                TrialAssessmentResult::Unrated(AssessmentFailure::Invalid { issues })
            }
        }
    }

    /// Rate a board and summarize its successful trace without solving it again.
    pub fn assess(&self, board: &Board, control: &mut ExecutionControl) -> AssessmentResult {
        match self.screen(board, control) {
            TrialAssessmentResult::Unrated(failure) => AssessmentResult::Unrated(failure),
            TrialAssessmentResult::Rated(trial) => match trial.complete() {
                Ok(result) => AssessmentResult::Rated(Box::new(result)),
                Err(error) => AssessmentResult::Unrated(AssessmentFailure::Invalid {
                    issues: message(error.to_string()),
                }),
            },
        }
    }

    /// Screen through the target policy and return a lower grade, matching grade or stall.
    pub fn screen_target(
        &self,
        board: &Board,
        target: Difficulty,
        control: &mut ExecutionControl,
    ) -> TargetScreenResult {
        self.screen_target_inner(PolicyEvaluation {
            board,
            control,
            target: Some(target),
            completion: None,
        })
    }

    /// A validated completion avoids re-enumerating partial-clue feasibility for its own givens.
    /// Layout identity and every given are checked again; this does not establish uniqueness.
    pub(crate) fn screen_target_with_completion(
        &self,
        target: WitnessedTarget<'_>,
        control: &mut ExecutionControl,
    ) -> TargetScreenResult {
        self.screen_target_inner(PolicyEvaluation {
            board: target.board,
            control,
            target: Some(target.difficulty),
            completion: Some(target.completion),
        })
    }

    fn screen_target_inner(&self, evaluation: PolicyEvaluation<'_>) -> TargetScreenResult {
        let target = evaluation.target;

        match self.evaluate(evaluation) {
            PolicyScreen::Rated { trial, feedback } => {
                if Some(trial.difficulty()) == target {
                    TargetScreenResult::MatchingTarget { trial, feedback }
                } else {
                    TargetScreenResult::BelowTarget { trial, feedback }
                }
            }
            PolicyScreen::Stalled(feedback) => TargetScreenResult::TargetStalled { feedback },
            PolicyScreen::Exhausted { cause, .. } => TargetScreenResult::Incomplete { cause },
            PolicyScreen::Invalid(issues) => TargetScreenResult::Invalid { issues },
        }
    }
}

impl RatedTrial {
    /// Consume this owned trial and replay statistics without repeating search.
    pub fn complete(self) -> CoreResult<RatedAssessment> {
        let workload = summarize_trace(&self.board, &self.rules, &self.trace)?;

        Ok(RatedAssessment {
            summary: DifficultyAssessment {
                variant: self.rules.rules().variant(),
                difficulty: self.difficulty,
                workload,
            },
            trace: self.trace,
        })
    }
}

fn extends_prefix(
    mut previous: impl Iterator<Item = Technique>,
    mut order: impl Iterator<Item = Technique>,
) -> bool {
    previous.all(|technique| order.next() == Some(technique))
}

fn validate_board_for_screening(
    evaluation: &mut PolicyEvaluation<'_>,
    computation: &PreparedComputation,
) -> BoardValidation {
    let is_incomplete = if let Some(completion) = evaluation.completion {
        // Only a witness for this layout and these givens can replace support checks.
        if !completion.covers(evaluation.board, computation.rules()) {
            return BoardValidation::Invalid(message(
                "Board does not belong to the known completion",
            ));
        }

        !evaluation.control.check()
    } else {
        let conflicts =
            evaluate_prepared_conflicts(evaluation.board, computation, evaluation.control);

        // Proven violations remain valid even if later support checks were cancelled.
        if !conflicts.violations.is_empty() {
            let issues = conflicts
                .violations
                .into_iter()
                .map(AssessmentIssue::Violation);
            return BoardValidation::Invalid(issues.collect());
        }

        conflicts.status == ConflictStatus::Incomplete
    };

    if is_incomplete {
        return BoardValidation::Cancelled;
    }

    BoardValidation::Valid
}

fn count_empty_cells(board: &Board) -> usize {
    let digits = board.values().iter().filter(|&&digit| digit == 0);
    digits.count()
}

fn screen_policies<'policy>(
    request: PolicyScreenRequest<'_, impl IntoIterator<Item = (Difficulty, &'policy [Technique])>>,
) -> PolicyScreen {
    let PolicyScreenRequest {
        mut evaluation,
        limits,
        computation,
        policies,
    } = request;

    match validate_board_for_screening(&mut evaluation, computation) {
        BoardValidation::Valid => {}
        BoardValidation::Invalid(issues) => return PolicyScreen::Invalid(issues),
        BoardValidation::Cancelled => {
            return PolicyScreen::Exhausted {
                cause: ExhaustionCause::Cancelled,
                stage: AssessmentStage::Validation,
                difficulty: None,
            };
        }
    }

    let PolicyEvaluation {
        board,
        control,
        target,
        ..
    } = evaluation;
    let variant = computation.rules().rules().variant();
    let mut workspace = create_prepared_workspace(board, computation);
    let mut previous_allowed: &[Technique] = &[];
    let mut previous_steps: Vec<LogicalStep> = vec![];
    let mut feedback = TargetFeedback {
        remaining_cells: count_empty_cells(board),
        deductions: 0,
    };

    for (difficulty, allowed) in policies {
        // A priority change can alter earlier deductions, so restart unless the prefix is intact.
        if !extends_prefix(
            execution_order(variant, previous_allowed),
            execution_order(variant, allowed),
        ) {
            workspace = create_prepared_workspace(board, computation);
            previous_steps.clear();
        }

        // Retained steps count toward the next policy's step limit.
        let result = analyze_workspace_owned(LogicContinuation {
            state: &mut workspace,
            allowed,
            max_steps: limits.max_steps,
            control,
            steps: previous_steps,
        });

        match result.status {
            LogicStatus::Cancelled | LogicStatus::StepLimit => {
                return PolicyScreen::Exhausted {
                    cause: if result.status == LogicStatus::Cancelled {
                        ExhaustionCause::Cancelled
                    } else {
                        ExhaustionCause::LogicalStepLimit
                    },
                    stage: AssessmentStage::Logic,
                    difficulty: Some(difficulty),
                };
            }
            LogicStatus::Solved | LogicStatus::Stalled => {}
        }

        feedback = TargetFeedback {
            remaining_cells: count_empty_cells(&result.board),
            deductions: result.steps.len(),
        };

        if result.status == LogicStatus::Solved {
            return PolicyScreen::Rated {
                trial: RatedTrial {
                    board: board.clone(),
                    rules: computation.rules().clone(),
                    difficulty,
                    trace: result.steps,
                },
                feedback,
            };
        }

        if Some(difficulty) == target {
            break;
        }

        previous_allowed = allowed;
        previous_steps = result.steps;
    }

    PolicyScreen::Stalled(feedback)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::logic::solver::analyze_logic;
    use crate::rating::policies::policy;
    use crate::rules::types::Cage;

    #[test]
    fn changed_priorities_reset_workspace() {
        let rows: Vec<serde_json::Value> = serde_json::from_str(include_str!(
            "../../../../tests/fixtures/engine-contracts/assessment.json"
        ))
        .unwrap();
        let row = rows
            .iter()
            .find(|row| row["id"] == "killer-medium")
            .unwrap();
        let input = &row["input"];
        let values: Vec<u8> = serde_json::from_value(input["board"].clone()).unwrap();
        let board = Board::try_from(values.as_slice()).unwrap();
        let cage_rows = input["rules"]["cages"].as_array().unwrap();
        let cages = cage_rows
            .iter()
            .map(|cage| Cage {
                cells: serde_json::from_value(cage["cells"].clone()).unwrap(),
                sum: cage["sum"].as_u64().unwrap() as u16,
            })
            .collect();
        let rules = PuzzleRules::Killer { cages };
        let mut setup = ExecutionControl::new();
        let Bounded::Complete(computation) = prepare_computation(&rules, &mut setup).unwrap()
        else {
            panic!("Expected fixture preparation");
        };
        let easy = policy(rules.variant(), Difficulty::Easy);
        let mut changed = policy(rules.variant(), Difficulty::Medium);
        changed.retain(|&technique| technique != Technique::CageCombination);
        changed.insert(0, Technique::CageCombination);
        assert!(!extends_prefix(
            easy.iter().copied(),
            changed.iter().copied()
        ));
        let policies = [
            (Difficulty::Easy, easy),
            (Difficulty::Medium, changed.clone()),
        ];

        let allowed_policies = policies
            .iter()
            .map(|(difficulty, allowed)| (*difficulty, allowed.as_slice()));
        let PolicyScreen::Rated { trial, .. } = screen_policies(PolicyScreenRequest {
            evaluation: PolicyEvaluation {
                board: &board,
                control: &mut ExecutionControl::new(),
                target: None,
                completion: None,
            },
            limits: AssessmentLimits::default(),
            computation: &computation,
            policies: allowed_policies,
        }) else {
            panic!("Expected changed-priority rating");
        };
        let fresh = analyze_logic(
            &board,
            computation.rules(),
            &changed,
            500,
            &mut ExecutionControl::new(),
        );

        assert_eq!(trial.difficulty(), Difficulty::Medium);
        assert_eq!(fresh.status, LogicStatus::Solved);
        assert_eq!(trial.trace, fresh.steps);
        assert_eq!(trial.trace[0].technique, Technique::CageCombination);
    }
}
