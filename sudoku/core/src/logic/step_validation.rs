//! Bind a step to exact clues and validate its proof before advancing replay state.
use super::advanced_evidence::validate_advanced_step;
use super::solver::find_step;
use super::techniques::Technique;
use super::types::{
    Evidence, LogicalAction, LogicalStep, LogicalWorkspace, RuleEvidence, RuleEvidenceKind,
};
use super::unit_evidence::valid_authored_unit_action;
use super::workspace::apply_established_step;
use crate::control::ExecutionControl;
use crate::rules::types::{PreparedRules, RuleConstraint};
use crate::types::{Bounded, CoreResult, EngineError};

#[derive(Clone, Copy)]
pub(crate) enum ValidationMode {
    Hint,
    Teaching,
}

pub(crate) struct StepReplay<'a> {
    pub step: &'a mut LogicalStep,
    pub context: &'a PreparedRules,
    pub state: &'a mut Option<LogicalWorkspace>,
    pub control: &'a mut ExecutionControl,
    pub mode: ValidationMode,
}

struct ReplayAction<'a> {
    step: &'a LogicalStep,
    state: &'a mut LogicalWorkspace,
    control: &'a mut ExecutionControl,
    mode: ValidationMode,
}

pub(crate) fn invalid() -> EngineError {
    EngineError::invalid("Hint evidence does not match the requested rules")
}

fn clue_matches(evidence: &RuleEvidence, constraints: &[RuleConstraint]) -> bool {
    let Some(constraint) = constraints
        .iter()
        .find(|constraint| constraint.id() == evidence.constraint_id)
    else {
        return false;
    };
    if constraint.cells() != evidence.cells {
        return false;
    }

    match (&evidence.kind, constraint) {
        (RuleEvidenceKind::Cage { sum, .. }, RuleConstraint::Cage { sum: expected, .. }) => {
            sum == expected
        }
        (RuleEvidenceKind::Thermo { path, .. }, RuleConstraint::Thermo { cells, .. }) => {
            path == cells
        }
        (RuleEvidenceKind::Arrow { circle, shaft, .. }, RuleConstraint::Arrow { cells, .. }) => {
            *circle == cells[0] && *shaft == cells[1..]
        }
        _ => false,
    }
}

fn validate_replay_action(input: ReplayAction<'_>) -> CoreResult<()> {
    let ReplayAction {
        step,
        state,
        control,
        mode,
    } = input;
    if matches!(step.evidence, Evidence::Advanced(_)) {
        return Ok(());
    }

    // A teaching exercise can choose any sound unit witness, regardless of detector order.
    if matches!(mode, ValidationMode::Teaching) && matches!(step.evidence, Evidence::Unit { .. }) {
        return if valid_authored_unit_action(state, step) {
            Ok(())
        } else {
            Err(invalid())
        };
    }

    let Bounded::Complete(Some(expected)) = find_step(state, &[step.technique], control) else {
        return Err(invalid());
    };

    // Teaching rule evidence can list equivalent eliminations in a different order.
    let is_expected_action = match (&expected.action, &step.action, mode) {
        (
            LogicalAction::Elimination { removals: expected },
            LogicalAction::Elimination { removals: actual },
            ValidationMode::Teaching,
        ) => {
            expected.len() == actual.len()
                && actual.iter().all(|removal| expected.contains(removal))
        }
        _ => expected.action == step.action,
    };
    if !is_expected_action {
        return Err(invalid());
    }

    Ok(())
}

pub(crate) fn validate_step_and_apply(replay: StepReplay<'_>) -> CoreResult<()> {
    let StepReplay {
        step,
        context,
        state,
        control,
        mode,
    } = replay;
    let layout = context.context();

    match &mut step.evidence {
        Evidence::Advanced(_) => {
            let Some(state) = state.as_ref() else {
                return Err(invalid());
            };

            if !control.check() || !validate_advanced_step(state, step) {
                return Err(invalid());
            }
        }
        Evidence::Unit {
            unit,
            cells,
            premises,
            units,
            ..
        } => {
            let Some(actual_unit) = layout
                .units
                .iter()
                .find(|candidate| candidate.kind == unit.kind && candidate.index == unit.index)
            else {
                return Err(invalid());
            };

            // Older evidence can omit related units; normalize it before replay.
            let units = units.get_or_insert_with(Vec::new);
            if !cells.iter().all(|cell| actual_unit.cells.contains(cell))
                || !premises
                    .iter()
                    .all(|evidence| clue_matches(evidence, &layout.constraints))
                || !units.iter().all(|unit| {
                    layout.units.iter().any(|candidate| {
                        candidate.kind == unit.kind && candidate.index == unit.index
                    })
                })
            {
                return Err(invalid());
            }

            // A locked candidate can remove the digit elsewhere in the intersecting unit.
            match &step.action {
                LogicalAction::Placement { cell, .. } if !actual_unit.cells.contains(cell) => {
                    return Err(invalid());
                }
                LogicalAction::Elimination { removals }
                    if step.technique != Technique::LockedCandidate
                        && !removals
                            .iter()
                            .all(|removal| actual_unit.cells.contains(&removal.cell)) =>
                {
                    return Err(invalid());
                }
                _ => {}
            }
        }
        Evidence::Rule(evidence) => {
            if !clue_matches(evidence, &layout.constraints) {
                return Err(invalid());
            }

            let affected = match &step.action {
                LogicalAction::Placement { cell, .. } => vec![*cell],
                LogicalAction::Elimination { removals } => {
                    removals.iter().map(|removal| removal.cell).collect()
                }
            };
            if !affected.iter().all(|cell| evidence.cells.contains(cell)) {
                return Err(invalid());
            }
        }
    }

    if let Some(state) = state.as_mut() {
        validate_replay_action(ReplayAction {
            step,
            state,
            control,
            mode,
        })?;

        // Advance the replay only after this proof has been checked against its current state.
        apply_established_step(state, step);
    }

    Ok(())
}
