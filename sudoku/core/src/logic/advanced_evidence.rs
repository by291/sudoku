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
use crate::types::{BOARD_SIZE, UNIT_SIZE};

const TRIPLE_SIZE: usize = 3;
const CLASSIC_UNIT_COUNT: usize = UNIT_SIZE * 3;

struct Proof<'a> {
    state: &'a LogicalWorkspace,
    technique: Technique,
    evidence: &'a AdvancedEvidence,
    removals: &'a [Removal],
}

struct SubsetProof<'a> {
    proof: Proof<'a>,
    unit: Unit,
    is_hidden: bool,
}

fn unit_for(state: &LogicalWorkspace, unit: Unit) -> Option<&SudokuUnit> {
    let units = &state.rules.context().units;
    units
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

fn has_unique_units(units: &[&SudokuUnit]) -> bool {
    let indices: BTreeSet<_> = units.iter().map(|unit| unit.index).collect();
    indices.len() == units.len()
}

fn has_unique_removals(removals: &[Removal]) -> bool {
    let pairs: BTreeSet<_> = removals
        .iter()
        .map(|removal| (removal.cell, removal.digit))
        .collect();
    pairs.len() == removals.len()
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
        || evidence.digits.len() > UNIT_SIZE
        || evidence
            .digits
            .iter()
            .any(|digit| !(1..=UNIT_SIZE as u8).contains(digit))
        || evidence.digits.iter().collect::<BTreeSet<_>>().len() != evidence.digits.len()
    {
        return false;
    }

    // Bind the supplied witness to the replay state before using its candidate domains.
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
        || removals.len() > BOARD_SIZE * UNIT_SIZE
        || !has_unique_removals(removals)
        || !removals.iter().all(|removal| {
            removal.cell < BOARD_SIZE
                && (1..=UNIT_SIZE as u8).contains(&removal.digit)
                && state.board.values()[removal.cell] == 0
                && state.candidates[removal.cell].bits() & mask_of(removal.digit) != 0
        })
    {
        return false;
    }

    let proof = Proof {
        state,
        technique: step.technique,
        evidence,
        removals,
    };
    match &evidence.kind {
        AdvancedEvidenceKind::Subset { unit, hidden } => validate_subset(SubsetProof {
            proof,
            unit: *unit,
            is_hidden: *hidden,
        }),
        AdvancedEvidenceKind::Fish { bases, covers } => validate_fish(proof, bases, covers),
        AdvancedEvidenceKind::Wing { pivot, wings } => validate_wing(proof, *pivot, *wings),
        AdvancedEvidenceKind::Coloring {
            mode,
            colors,
            links,
        } => validate_coloring(ColoringProof {
            proof,
            mode: *mode,
            colors,
            links,
        }),
    }
}

fn validate_subset(subset: SubsetProof<'_>) -> bool {
    let Proof {
        state,
        technique,
        evidence,
        removals,
    } = subset.proof;
    let unit = subset.unit;
    let expected_technique = if subset.is_hidden {
        Technique::HiddenTriple
    } else {
        Technique::NakedTriple
    };

    let Some(unit) = unit_for(state, unit) else {
        return false;
    };
    if evidence.cells.len() != TRIPLE_SIZE
        || evidence.digits.len() != TRIPLE_SIZE
        || !evidence
            .cells
            .iter()
            .all(|&cell| unit.cells.contains(&cell) && state.board.values()[cell] == 0)
        || technique != expected_technique
    {
        return false;
    }

    // A hidden subset excludes other digits from its cells. A naked subset excludes its
    // digits from the rest of the unit.
    if subset.is_hidden {
        let positions: Vec<Vec<usize>> = evidence
            .digits
            .iter()
            .map(|&digit| candidate_positions(state, &unit.cells, digit))
            .collect();
        let digit_cells = positions.iter().flatten();
        let distinct_cells: BTreeSet<_> = digit_cells.copied().collect();
        let cells: Vec<_> = distinct_cells.into_iter().collect();

        return positions.iter().all(|cells| cells.len() >= 2)
            && equal_set(&cells, &evidence.cells)
            && removals.iter().all(|removal| {
                evidence.cells.contains(&removal.cell) && !evidence.digits.contains(&removal.digit)
            });
    }

    let candidate_union = evidence
        .cells
        .iter()
        .fold(0, |bits, &cell| bits | state.candidates[cell].bits());
    evidence
        .cells
        .iter()
        .all(|&cell| state.candidates[cell].bits().count_ones() >= 2)
        && equal_set(&digits_in(candidate_union), &evidence.digits)
        && removals.iter().all(|removal| {
            unit.cells.contains(&removal.cell)
                && !evidence.cells.contains(&removal.cell)
                && evidence.digits.contains(&removal.digit)
        })
}

fn validate_fish(proof: Proof<'_>, base_ids: &[Unit], cover_ids: &[Unit]) -> bool {
    let Proof {
        state,
        technique,
        evidence,
        removals,
    } = proof;

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
        || !has_unique_units(&bases)
        || !has_unique_units(&covers)
    {
        return false;
    }

    let digit = evidence.digits[0];
    let positions: Vec<Vec<usize>> = bases
        .iter()
        .map(|unit| candidate_positions(state, &unit.cells, digit))
        .collect();
    let candidate_cells = positions.iter().flatten();
    let cells: Vec<usize> = candidate_cells.copied().collect();

    // The selected bases fill every cover for this digit, excluding other positions there.
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

fn validate_wing(proof: Proof<'_>, pivot: usize, wings: [usize; 2]) -> bool {
    let Proof {
        state,
        technique,
        evidence,
        removals,
    } = proof;

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
    let wing_cells = [
        // The pivot belongs to the witness even though only the wings see the targets.
        pivot, first, second,
    ];
    let is_witness_valid = technique == Technique::XYWing
        && equal_set(&evidence.cells, &wing_cells)
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
        && (masks[0] & masks[1]) != (masks[0] & masks[2]);
    if !is_witness_valid {
        return false;
    }

    // Either pivot value forces the shared digit in one wing, so a target must see both.
    removals.iter().all(|removal| {
        removal.digit == shared[0]
            && !evidence.cells.contains(&removal.cell)
            && are_classic_peers(first, removal.cell)
            && are_classic_peers(second, removal.cell)
    })
}

struct ColoringProof<'a> {
    proof: Proof<'a>,
    mode: ColoringMode,
    colors: &'a [Vec<usize>; 2],
    links: &'a [ColoringLink],
}

fn validate_coloring(coloring: ColoringProof<'_>) -> bool {
    let Proof {
        state,
        technique,
        evidence,
        removals,
    } = coloring.proof;
    let ColoringProof {
        mode,
        colors,
        links,
        ..
    } = coloring;

    let [first, second] = colors;
    let colored_cells = first.iter().chain(second);
    let cells: Vec<_> = colored_cells.copied().collect();
    if technique != Technique::SimpleColoring
        || evidence.digits.len() != 1
        || !valid_cells(first)
        || !valid_cells(second)
        || !equal_set(&cells, &evidence.cells)
        || links.is_empty()
        || links.len() > CLASSIC_UNIT_COUNT
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

    // Each link must be an actual either-or choice between two opposite colors.
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
            // A collision rules out its color only when the other color remains possible.
            let invalid_color = match conflicts[0] {
                true => first,
                false => second,
            };
            conflicts[0] != conflicts[1]
                && removals
                    .iter()
                    .all(|removal| removal.digit == digit && invalid_color.contains(&removal.cell))
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
