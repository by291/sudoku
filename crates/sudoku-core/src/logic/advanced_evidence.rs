use std::collections::BTreeSet;

use super::pattern_facts::{
    are_classic_peers, candidate_positions, digits_in, has_peer_collision, mask_of,
};
use super::techniques::Technique;
use super::types::{
    AdvancedEvidence, AdvancedEvidenceKind, ColoringLink, ColoringMode, Evidence, LogicalAction,
    LogicalStep, LogicalWorkspace, Removal,
};
use crate::rules::types::{PuzzleRules, SudokuUnit, Unit, UnitKind};
use crate::types::BOARD_SIZE;

fn unit_for(state: &LogicalWorkspace, unit: Unit) -> Option<&SudokuUnit> {
    state
        .rules
        .context()
        .units
        .iter()
        .find(|candidate| candidate.kind == unit.kind && candidate.index == unit.index)
}

fn equal_set<T: Ord>(first: &[T], second: &[T]) -> bool {
    first.len() == second.len()
        && first.iter().collect::<BTreeSet<_>>().len() == first.len()
        && first.iter().all(|value| second.contains(value))
}

fn valid_cells(cells: &[usize]) -> bool {
    !cells.is_empty()
        && cells.len() <= BOARD_SIZE
        && cells.iter().all(|&cell| cell < BOARD_SIZE)
        && cells.iter().collect::<BTreeSet<_>>().len() == cells.len()
}

/// Check the supplied proof directly; a detector rerun or stored solution is never a proof.
pub fn validate_advanced_step(state: &LogicalWorkspace, step: &LogicalStep) -> bool {
    let Evidence::Advanced(evidence) = &step.evidence else {
        return false;
    };
    let LogicalAction::Elimination { removals } = &step.action else {
        return false;
    };
    if !step.technique.is_advanced()
        || !matches!(state.rules.rules(), PuzzleRules::Classic)
        || !valid_cells(&evidence.cells)
        || evidence.digits.is_empty()
        || evidence.digits.len() > 9
        || evidence.digits.iter().any(|digit| !(1..=9).contains(digit))
        || evidence.digits.iter().collect::<BTreeSet<_>>().len() != evidence.digits.len()
    {
        return false;
    }
    if evidence.domains.len() != BOARD_SIZE
        || !evidence.domains.iter().enumerate().all(|(index, domain)| {
            domain.cell == index
                && domain.mask.bits()
                    == if state.board.values()[index] == 0 {
                        state.candidates[index].bits()
                    } else {
                        0
                    }
        })
    {
        return false;
    }
    if removals.is_empty()
        || removals.len() > BOARD_SIZE * 9
        || removals
            .iter()
            .map(|removal| (removal.cell, removal.digit))
            .collect::<BTreeSet<_>>()
            .len()
            != removals.len()
        || !removals.iter().all(|removal| {
            removal.cell < BOARD_SIZE
                && (1..=9).contains(&removal.digit)
                && state.board.values()[removal.cell] == 0
                && state.candidates[removal.cell].bits() & mask_of(removal.digit) != 0
        })
    {
        return false;
    }

    match &evidence.kind {
        AdvancedEvidenceKind::Subset { unit, hidden } => {
            validate_subset(state, step.technique, evidence, removals, *unit, *hidden)
        }
        AdvancedEvidenceKind::Fish { bases, covers } => {
            validate_fish(state, step.technique, evidence, removals, bases, covers)
        }
        AdvancedEvidenceKind::Wing { pivot, wings } => {
            validate_wing(state, step.technique, evidence, removals, *pivot, *wings)
        }
        AdvancedEvidenceKind::Coloring {
            mode,
            colors,
            links,
        } => validate_coloring(
            state,
            step.technique,
            evidence,
            removals,
            *mode,
            colors,
            links,
        ),
    }
}

fn validate_subset(
    state: &LogicalWorkspace,
    technique: Technique,
    evidence: &AdvancedEvidence,
    removals: &[Removal],
    unit: Unit,
    hidden: bool,
) -> bool {
    let Some(unit) = unit_for(state, unit) else {
        return false;
    };
    if evidence.cells.len() != 3
        || evidence.digits.len() != 3
        || !evidence
            .cells
            .iter()
            .all(|&cell| unit.cells.contains(&cell) && state.board.values()[cell] == 0)
        || technique
            != if hidden {
                Technique::HiddenTriple
            } else {
                Technique::NakedTriple
            }
    {
        return false;
    }
    if hidden {
        let positions: Vec<Vec<usize>> = evidence
            .digits
            .iter()
            .map(|&digit| candidate_positions(state, &unit.cells, digit))
            .collect();
        let cells: Vec<usize> = positions
            .iter()
            .flatten()
            .copied()
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect();
        return positions.iter().all(|cells| cells.len() >= 2)
            && equal_set(&cells, &evidence.cells)
            && removals.iter().all(|removal| {
                evidence.cells.contains(&removal.cell) && !evidence.digits.contains(&removal.digit)
            });
    }
    evidence
        .cells
        .iter()
        .all(|&cell| state.candidates[cell].bits().count_ones() >= 2)
        && equal_set(
            &digits_in(
                evidence
                    .cells
                    .iter()
                    .fold(0, |bits, &cell| bits | state.candidates[cell].bits()),
            ),
            &evidence.digits,
        )
        && removals.iter().all(|removal| {
            unit.cells.contains(&removal.cell)
                && !evidence.cells.contains(&removal.cell)
                && evidence.digits.contains(&removal.digit)
        })
}

fn validate_fish(
    state: &LogicalWorkspace,
    technique: Technique,
    evidence: &AdvancedEvidence,
    removals: &[Removal],
    base_ids: &[Unit],
    cover_ids: &[Unit],
) -> bool {
    let size = match technique {
        Technique::XWing => 2,
        Technique::Swordfish => 3,
        _ => return false,
    };
    if evidence.digits.len() != 1 || base_ids.len() != size || cover_ids.len() != size {
        return false;
    }

    let Some(bases) = base_ids
        .iter()
        .map(|&unit| unit_for(state, unit))
        .collect::<Option<Vec<_>>>()
    else {
        return false;
    };
    let Some(covers) = cover_ids
        .iter()
        .map(|&unit| unit_for(state, unit))
        .collect::<Option<Vec<_>>>()
    else {
        return false;
    };
    let kind = bases[0].kind;
    let other_kind = if kind == UnitKind::Row {
        UnitKind::Column
    } else {
        UnitKind::Row
    };
    if !matches!(kind, UnitKind::Row | UnitKind::Column)
        || bases.iter().any(|unit| unit.kind != kind)
        || covers.iter().any(|unit| unit.kind != other_kind)
        || bases
            .iter()
            .map(|unit| unit.index)
            .collect::<BTreeSet<_>>()
            .len()
            != size
        || covers
            .iter()
            .map(|unit| unit.index)
            .collect::<BTreeSet<_>>()
            .len()
            != size
    {
        return false;
    }

    let digit = evidence.digits[0];
    let positions: Vec<Vec<usize>> = bases
        .iter()
        .map(|unit| candidate_positions(state, &unit.cells, digit))
        .collect();
    let cells: Vec<usize> = positions.iter().flatten().copied().collect();
    positions
        .iter()
        .all(|cells| (2..=size).contains(&cells.len()))
        && equal_set(&cells, &evidence.cells)
        && cells
            .iter()
            .all(|cell| covers.iter().any(|unit| unit.cells.contains(cell)))
        && covers
            .iter()
            .all(|unit| cells.iter().any(|cell| unit.cells.contains(cell)))
        && removals.iter().all(|removal| {
            removal.digit == digit
                && covers.iter().any(|unit| unit.cells.contains(&removal.cell))
                && !bases.iter().any(|unit| unit.cells.contains(&removal.cell))
        })
}

fn validate_wing(
    state: &LogicalWorkspace,
    technique: Technique,
    evidence: &AdvancedEvidence,
    removals: &[Removal],
    pivot: usize,
    wings: [usize; 2],
) -> bool {
    let [first, second] = wings;
    if pivot >= BOARD_SIZE || first >= BOARD_SIZE || second >= BOARD_SIZE {
        return false;
    }

    let masks = [
        state.candidates[pivot].bits(),
        state.candidates[first].bits(),
        state.candidates[second].bits(),
    ];
    let shared = digits_in(masks[1] & masks[2] & !masks[0]);
    technique == Technique::XYWing
        && equal_set(&evidence.cells, &[pivot, first, second])
        && evidence
            .cells
            .iter()
            .all(|&cell| state.board.values()[cell] == 0)
        && masks.iter().all(|mask| mask.count_ones() == 2)
        && are_classic_peers(pivot, first)
        && are_classic_peers(pivot, second)
        && shared.len() == 1
        && equal_set(&evidence.digits, &digits_in(masks[0] | masks[1] | masks[2]))
        && (masks[0] & masks[1]).count_ones() == 1
        && (masks[0] & masks[2]).count_ones() == 1
        && (masks[0] & masks[1]) != (masks[0] & masks[2])
        && removals.iter().all(|removal| {
            removal.digit == shared[0]
                && !evidence.cells.contains(&removal.cell)
                && are_classic_peers(first, removal.cell)
                && are_classic_peers(second, removal.cell)
        })
}

fn validate_coloring(
    state: &LogicalWorkspace,
    technique: Technique,
    evidence: &AdvancedEvidence,
    removals: &[Removal],
    mode: ColoringMode,
    colors: &[Vec<usize>; 2],
    links: &[ColoringLink],
) -> bool {
    let [first, second] = colors;
    let cells: Vec<usize> = first.iter().chain(second).copied().collect();
    if technique != Technique::SimpleColoring
        || evidence.digits.len() != 1
        || !valid_cells(first)
        || !valid_cells(second)
        || !equal_set(&cells, &evidence.cells)
        || links.is_empty()
        || links.len() > 27
    {
        return false;
    }

    let digit = evidence.digits[0];
    if !evidence
        .cells
        .iter()
        .all(|&cell| candidate_positions(state, &[cell], digit).len() == 1)
    {
        return false;
    }
    for link in links {
        let Some(unit) = unit_for(state, link.unit) else {
            return false;
        };
        if unit
            .cells
            .iter()
            .any(|&cell| state.board.values()[cell] == digit)
            || !equal_set(&candidate_positions(state, &unit.cells, digit), &link.cells)
            || !link.cells.iter().all(|cell| evidence.cells.contains(cell))
            || first.contains(&link.cells[0]) == first.contains(&link.cells[1])
        {
            return false;
        }
    }

    // Reachability prevents unrelated strong-link chains from posing as a single color choice.
    let mut linked = BTreeSet::from([first[0]]);
    for _ in 0..evidence.cells.len() {
        for link in links {
            if link.cells.iter().any(|cell| linked.contains(cell)) {
                linked.extend(link.cells);
            }
        }
    }
    if linked.len() != evidence.cells.len() {
        return false;
    }

    let conflicts = [has_peer_collision(first), has_peer_collision(second)];
    match mode {
        ColoringMode::Wrap => {
            conflicts[0] != conflicts[1]
                && removals.iter().all(|removal| {
                    removal.digit == digit
                        && colors[if conflicts[0] { 0 } else { 1 }].contains(&removal.cell)
                })
        }
        ColoringMode::Trap => {
            !conflicts.iter().any(|&conflict| conflict)
                && removals.iter().all(|removal| {
                    removal.digit == digit
                        && !evidence.cells.contains(&removal.cell)
                        && first
                            .iter()
                            .any(|&other| are_classic_peers(removal.cell, other))
                        && second
                            .iter()
                            .any(|&other| are_classic_peers(removal.cell, other))
                })
        }
    }
}
