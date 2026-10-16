use std::cell::OnceCell;

use super::input::validate_input;
use super::policies::{execution_order, policy_slice, supported_difficulties, supports_difficulty};
use super::types::{
    AssessmentFailure, AssessmentIssue, AssessmentResult, AssessmentStage, DifficultyAssessment,
    ExhaustionCause, PreparedAssessment, RatedAssessment, RatedTrial, TargetFeedback,
    TargetScreenResult, TrialAssessmentResult,
};
use super::types::{AssessmentInput, AssessmentLimits};
use super::workload::summarize_trace;
use crate::budget::{WorkBudget, WorkStage};
use crate::constraints::computation::prepare_computation;
use crate::constraints::conflicts::evaluate_prepared_conflicts;
use crate::constraints::types::{ConflictStatus, PreparedComputation};
use crate::logic::solver::analyze_workspace_owned;
use crate::logic::techniques::Technique;
use crate::logic::types::{LogicStatus, LogicalStep};
use crate::logic::workspace::create_prepared_workspace;
use crate::rules::context::validate_rules;
use crate::rules::types::PuzzleRules;
use crate::types::{Board, Bounded, CoreResult, Difficulty, EngineError};

/// Validate and own inputs now; charge expensive layout preparation only on the first evaluation.
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

/// Share an already charged immutable layout while keeping all assessment workspaces local.
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

pub fn assess_puzzle(input: &AssessmentInput) -> AssessmentResult {
    assess_puzzle_with_budget(input, &mut WorkBudget::new(input.limits.max_work))
}

pub fn assess_puzzle_with_budget(
    input: &AssessmentInput,
    budget: &mut WorkBudget,
) -> AssessmentResult {
    let prepared =
        validate_input(input).and_then(|()| prepare_assessment(&input.rules, input.limits));
    match prepared {
        Ok(owner) => owner.assess(&input.board, budget),
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

fn message(value: impl Into<String>) -> Vec<AssessmentIssue> {
    vec![AssessmentIssue::Message(value.into())]
}

impl PreparedAssessment {
    fn prepared(&self, budget: &mut WorkBudget) -> CoreResult<Bounded<&PreparedComputation>> {
        if let Some(computation) = self.computation.get() {
            return Ok(Bounded::Complete(computation));
        }

        let Bounded::Complete(computation) = prepare_computation(&self.rules, budget)? else {
            return Ok(Bounded::BudgetExhausted);
        };
        self.computation
            .set(computation)
            .map_err(|_| EngineError::invalid("Assessment preparation was already initialized"))?;
        self.computation
            .get()
            .map(Bounded::Complete)
            .ok_or_else(|| EngineError::invalid("Assessment preparation was not retained"))
    }

    fn evaluate(
        &self,
        board: &Board,
        budget: &mut WorkBudget,
        target: Option<Difficulty>,
    ) -> PolicyScreen {
        if budget.used() + budget.remaining() > self.limits.max_work {
            return PolicyScreen::Invalid(message("Invalid caller-owned assessment budget"));
        }
        if target.is_some_and(|target| !supports_difficulty(self.rules.variant(), target)) {
            return PolicyScreen::Invalid(message("Unsupported assessment target"));
        }

        let computation = match self.prepared(budget) {
            Ok(Bounded::Complete(computation)) => computation,
            Ok(Bounded::BudgetExhausted) => {
                return PolicyScreen::Exhausted {
                    cause: ExhaustionCause::WorkLimit,
                    stage: AssessmentStage::Validation,
                    difficulty: None,
                };
            }
            Err(error) => return PolicyScreen::Invalid(message(error.to_string())),
        };
        budget.with_stage(WorkStage::Logic, |budget| {
            let policies = supported_difficulties(self.rules.variant())
                .iter()
                .map(|&difficulty| (difficulty, policy_slice(self.rules.variant(), difficulty)));
            screen_policies(board, self.limits, computation, budget, target, policies)
        })
    }

    /// Consume a caller-owned aggregate budget without resetting it between policies or boards.
    pub fn screen(&self, board: &Board, budget: &mut WorkBudget) -> TrialAssessmentResult {
        let variant = self.rules.variant();
        match self.evaluate(board, budget, None) {
            PolicyScreen::Rated { trial, .. } => TrialAssessmentResult::Rated(trial),
            PolicyScreen::Stalled(_) => {
                TrialAssessmentResult::Unrated(AssessmentFailure::Ungraded { variant })
            }
            PolicyScreen::Exhausted {
                stage, difficulty, ..
            } => TrialAssessmentResult::Unrated(AssessmentFailure::BudgetExhausted {
                variant,
                stage,
                difficulty,
            }),
            PolicyScreen::Invalid(issues) => {
                TrialAssessmentResult::Unrated(AssessmentFailure::Invalid { issues })
            }
        }
    }

    pub fn assess(&self, board: &Board, budget: &mut WorkBudget) -> AssessmentResult {
        match self.screen(board, budget) {
            TrialAssessmentResult::Unrated(failure) => AssessmentResult::Unrated(failure),
            TrialAssessmentResult::Rated(trial) => match trial.complete() {
                Ok(result) => AssessmentResult::Rated(Box::new(result)),
                Err(error) => AssessmentResult::Unrated(AssessmentFailure::Invalid {
                    issues: message(error.to_string()),
                }),
            },
        }
    }

    pub fn screen_target(
        &self,
        board: &Board,
        target: Difficulty,
        budget: &mut WorkBudget,
    ) -> TargetScreenResult {
        match self.evaluate(board, budget, Some(target)) {
            PolicyScreen::Rated { trial, feedback } => {
                if trial.difficulty() == target {
                    TargetScreenResult::MatchingTarget { trial, feedback }
                } else {
                    TargetScreenResult::BelowTarget { trial, feedback }
                }
            }
            PolicyScreen::Stalled(feedback) => TargetScreenResult::TargetStalled { feedback },
            PolicyScreen::Exhausted { cause, .. } => TargetScreenResult::BudgetExhausted { cause },
            PolicyScreen::Invalid(issues) => TargetScreenResult::Invalid { issues },
        }
    }
}

impl RatedTrial {
    /// Consume this owned trial and replay statistics without any search or additional charged work.
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

fn screen_policies<'policy>(
    board: &Board,
    limits: AssessmentLimits,
    computation: &PreparedComputation,
    budget: &mut WorkBudget,
    target: Option<Difficulty>,
    policies: impl IntoIterator<Item = (Difficulty, &'policy [Technique])>,
) -> PolicyScreen {
    let conflicts = evaluate_prepared_conflicts(board, computation, budget);
    if !conflicts.violations.is_empty() {
        return PolicyScreen::Invalid(
            conflicts
                .violations
                .into_iter()
                .map(AssessmentIssue::Violation)
                .collect(),
        );
    }
    if conflicts.status == ConflictStatus::BudgetExhausted {
        return PolicyScreen::Exhausted {
            cause: ExhaustionCause::WorkLimit,
            stage: AssessmentStage::Validation,
            difficulty: None,
        };
    }

    let mut workspace = create_prepared_workspace(board, computation);
    let mut previous_allowed: &[Technique] = &[];
    let mut previous_steps: Vec<LogicalStep> = vec![];
    let mut feedback = TargetFeedback {
        remaining_cells: board.values().iter().filter(|&&digit| digit == 0).count(),
        deductions: 0,
    };
    for (difficulty, allowed) in policies {
        let variant = computation.rules().rules().variant();
        // Only an unchanged priority prefix can resume domains; changed priorities need a fresh board.
        if !extends_prefix(
            execution_order(variant, previous_allowed),
            execution_order(variant, allowed),
        ) {
            workspace = create_prepared_workspace(board, computation);
            previous_steps.clear();
        }

        let result = analyze_workspace_owned(
            &mut workspace,
            allowed,
            limits.max_steps,
            budget,
            previous_steps,
        );
        match result.status {
            LogicStatus::WorkLimit | LogicStatus::StepLimit => {
                return PolicyScreen::Exhausted {
                    cause: if result.status == LogicStatus::WorkLimit {
                        ExhaustionCause::WorkLimit
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
            remaining_cells: result
                .board
                .values()
                .iter()
                .filter(|&&digit| digit == 0)
                .count(),
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
        let cages = input["rules"]["cages"]
            .as_array()
            .unwrap()
            .iter()
            .map(|cage| Cage {
                cells: serde_json::from_value(cage["cells"].clone()).unwrap(),
                sum: cage["sum"].as_u64().unwrap() as u16,
            })
            .collect();
        let rules = PuzzleRules::Killer { cages };
        let mut setup = WorkBudget::new(4000000);
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

        let PolicyScreen::Rated { trial, .. } = screen_policies(
            &board,
            AssessmentLimits::default(),
            &computation,
            &mut WorkBudget::new(4000000),
            None,
            policies
                .iter()
                .map(|(difficulty, allowed)| (*difficulty, allowed.as_slice())),
        ) else {
            panic!("Expected changed-priority rating");
        };
        let fresh = analyze_logic(
            &board,
            computation.rules(),
            &changed,
            500,
            &mut WorkBudget::new(4000000),
        );

        assert_eq!(trial.difficulty(), Difficulty::Medium);
        assert_eq!(fresh.status, LogicStatus::Solved);
        assert_eq!(trial.trace, fresh.steps);
        assert_eq!(trial.trace[0].technique, Technique::CageCombination);
    }
}
