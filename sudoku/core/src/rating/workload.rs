use std::collections::BTreeSet;

use super::policies::{policy, technique_tier};
use super::types::{ReasoningWorkload, TechniqueCounts};
use crate::logic::pattern_facts::mask_of;
use crate::logic::types::{Evidence, LogicalAction, LogicalStep};
use crate::logic::workspace::{apply_established_step, create_workspace};
use crate::rules::types::{PreparedRules, UnitKind};
use crate::types::{BOARD_SIZE, Board, CoreResult, Difficulty, EngineError};

fn has_variant_evidence(step: &LogicalStep) -> bool {
    match &step.evidence {
        Evidence::Advanced(_) => false,
        Evidence::Rule(_) => true,
        Evidence::Unit {
            unit,
            premises,
            units,
            ..
        } => {
            !premises.is_empty()
                || matches!(unit.kind, UnitKind::Region | UnitKind::Diagonal)
                || units.as_ref().is_some_and(|units| {
                    units
                        .iter()
                        .any(|unit| matches!(unit.kind, UnitKind::Region | UnitKind::Diagonal))
                })
        }
    }
}

/// Replay effective actions; proving their soundness remains the detector's separate responsibility.
pub fn summarize_trace(
    board: &Board,
    rules: &PreparedRules,
    steps: &[LogicalStep],
) -> CoreResult<ReasoningWorkload> {
    let mut state = create_workspace(board, rules);
    let order = policy(rules.rules().variant(), Difficulty::Expert);
    let mut result = ReasoningWorkload {
        steps: steps.len() as u64,
        placements: 0,
        eliminations: 0,
        candidate_removals: 0,
        technique_counts: TechniqueCounts::default(),
        highest_tier: None,
        highest_technique: None,
        variant_steps: 0,
    };
    let mut highest_order = None;
    for step in steps {
        let Some(index) = order
            .iter()
            .position(|&technique| technique == step.technique)
        else {
            return Err(EngineError::invalid("Trace uses an inapplicable technique"));
        };
        match &step.action {
            LogicalAction::Placement { cell, digit } => {
                if *cell >= BOARD_SIZE
                    || !(1..=9).contains(digit)
                    || state.board.values()[*cell] != 0
                    || state.candidates[*cell].bits() & mask_of(*digit) == 0
                {
                    return Err(EngineError::invalid(
                        "Trace placement does not change a supported empty cell",
                    ));
                }
                result.placements += 1;
            }
            LogicalAction::Elimination { removals } => {
                if removals.is_empty() {
                    return Err(EngineError::invalid("Trace contains an empty elimination"));
                }
                let mut removed = BTreeSet::new();
                for removal in removals {
                    if removal.cell >= BOARD_SIZE
                        || !(1..=9).contains(&removal.digit)
                        || state.board.values()[removal.cell] != 0
                        || !removed.insert((removal.cell, removal.digit))
                        || state.candidates[removal.cell].bits() & mask_of(removal.digit) == 0
                    {
                        return Err(EngineError::invalid(
                            "Trace contains a duplicate or ineffective removal",
                        ));
                    }
                }
                result.eliminations += 1;
                result.candidate_removals += removed.len() as u64;
            }
        }
        apply_established_step(&mut state, step);
        result.technique_counts.increment(step.technique);
        if has_variant_evidence(step) {
            result.variant_steps += 1;
        }
        if highest_order.is_none_or(|highest| index > highest) {
            highest_order = Some(index);
            result.highest_technique = Some(step.technique);
            result.highest_tier = Some(technique_tier(step.technique));
        }
    }
    Ok(result)
}
