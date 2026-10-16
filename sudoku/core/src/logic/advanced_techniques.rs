use std::collections::BTreeSet;

use super::evidence::unit_identity;
use super::pattern_facts::{are_classic_peers, candidate_positions, digits_in, has_peer_collision};
use super::techniques::Technique;
use super::types::{
    AdvancedEvidence, AdvancedEvidenceKind, CandidateDomain, ColoringLink, ColoringMode, Evidence,
    LogicalAction, LogicalStep, LogicalWorkspace, Removal, StepOutcome,
};
use crate::budget::WorkBudget;
use crate::rules::types::{PuzzleRules, UnitKind};
use crate::types::{BOARD_SIZE, Bounded, CandidateMask};

// Lexicographic combinations preserve the reference's recursive traversal without eager enumeration.
fn combinations<T: Clone>(values: &[T], size: usize) -> impl Iterator<Item = Vec<T>> + '_ {
    let mut indices: Vec<usize> = (0..size).collect();
    let mut finished = size == 0 || size > values.len();
    std::iter::from_fn(move || {
        if finished {
            return None;
        }

        let result = indices.iter().map(|&index| values[index].clone()).collect();
        let next = (0..size)
            .rev()
            .find(|&index| indices[index] < values.len() - size + index);
        if let Some(index) = next {
            indices[index] += 1;
            for offset in index + 1..size {
                indices[offset] = indices[offset - 1] + 1;
            }
        } else {
            finished = true;
        }
        Some(result)
    })
}

fn pattern_evidence(
    state: &LogicalWorkspace,
    mut cells: Vec<usize>,
    digits: Vec<u8>,
    kind: AdvancedEvidenceKind,
) -> AdvancedEvidence {
    cells.sort_unstable();
    // Snapshots are compared with replayed domains; they cannot establish their own premises.
    let domains = state
        .candidates
        .iter()
        .enumerate()
        .map(|(cell, &mask)| CandidateDomain {
            cell,
            mask: if state.board.values()[cell] == 0 {
                mask
            } else {
                CandidateMask::EMPTY
            },
        })
        .collect();
    AdvancedEvidence {
        cells,
        digits,
        domains,
        kind,
    }
}

fn elimination(
    state: &LogicalWorkspace,
    technique: Technique,
    evidence: AdvancedEvidence,
    targets: Vec<usize>,
    digits: &[u8],
) -> Option<Box<LogicalStep>> {
    let mut removals = vec![];
    for cell in targets.into_iter().collect::<BTreeSet<_>>() {
        for &digit in digits {
            if state.board.values()[cell] == 0
                && digits_in(state.candidates[cell].bits()).contains(&digit)
            {
                removals.push(Removal { cell, digit });
            }
        }
    }
    if removals.is_empty() {
        None
    } else {
        Some(Box::new(LogicalStep {
            technique,
            evidence: Evidence::Advanced(evidence),
            action: LogicalAction::Elimination { removals },
        }))
    }
}

fn find_triples(state: &LogicalWorkspace, hidden: bool, budget: &mut WorkBudget) -> StepOutcome {
    for unit in &state.rules.context().units {
        let empty: Vec<usize> = unit
            .cells
            .iter()
            .copied()
            .filter(|&cell| state.board.values()[cell] == 0)
            .collect();
        let choices: Vec<usize> = if hidden {
            (1..=9).collect()
        } else {
            empty
                .iter()
                .copied()
                .filter(|&cell| (2..=3).contains(&state.candidates[cell].bits().count_ones()))
                .collect()
        };
        for choice in combinations(&choices, 3) {
            if !budget.consume(1) {
                return Bounded::BudgetExhausted;
            }

            let digits = if hidden {
                choice.iter().map(|&digit| digit as u8).collect()
            } else {
                digits_in(
                    choice
                        .iter()
                        .fold(0, |bits, &cell| bits | state.candidates[cell].bits()),
                )
            };
            let locations: Vec<Vec<usize>> = digits
                .iter()
                .map(|&digit| candidate_positions(state, &unit.cells, digit))
                .collect();
            let cells: Vec<usize> = if hidden {
                locations
                    .iter()
                    .flatten()
                    .copied()
                    .collect::<BTreeSet<_>>()
                    .into_iter()
                    .collect()
            } else {
                choice
            };
            if digits.len() != 3
                || cells.len() != 3
                || (hidden && locations.iter().any(|positions| positions.len() < 2))
            {
                continue;
            }

            let evidence = pattern_evidence(
                state,
                cells.clone(),
                digits.clone(),
                AdvancedEvidenceKind::Subset {
                    unit: unit_identity(unit),
                    hidden,
                },
            );
            let (technique, targets, removed) = if hidden {
                (
                    Technique::HiddenTriple,
                    cells,
                    (1..=9).filter(|digit| !digits.contains(digit)).collect(),
                )
            } else {
                (
                    Technique::NakedTriple,
                    empty
                        .iter()
                        .copied()
                        .filter(|cell| !cells.contains(cell))
                        .collect(),
                    digits,
                )
            };
            if let Some(step) = elimination(state, technique, evidence, targets, &removed) {
                return Bounded::Complete(Some(step));
            }
        }
    }
    Bounded::Complete(None)
}

fn find_fish(state: &LogicalWorkspace, size: usize, budget: &mut WorkBudget) -> StepOutcome {
    for kind in [UnitKind::Row, UnitKind::Column] {
        let other_kind = if kind == UnitKind::Row {
            UnitKind::Column
        } else {
            UnitKind::Row
        };
        let bases: Vec<_> = state
            .rules
            .context()
            .units
            .iter()
            .filter(|unit| unit.kind == kind)
            .collect();
        let covers: Vec<_> = state
            .rules
            .context()
            .units
            .iter()
            .filter(|unit| unit.kind == other_kind)
            .collect();
        for digit in 1..=9 {
            let possible: Vec<_> = bases
                .iter()
                .copied()
                .filter(|unit| {
                    (2..=size).contains(&candidate_positions(state, &unit.cells, digit).len())
                })
                .collect();
            for selected in combinations(&possible, size) {
                if !budget.consume(1) {
                    return Bounded::BudgetExhausted;
                }
                let cells: Vec<usize> = selected
                    .iter()
                    .flat_map(|unit| candidate_positions(state, &unit.cells, digit))
                    .collect();
                let covering: Vec<_> = covers
                    .iter()
                    .copied()
                    .filter(|unit| cells.iter().any(|cell| unit.cells.contains(cell)))
                    .collect();
                if covering.len() != size {
                    continue;
                }
                let evidence = pattern_evidence(
                    state,
                    cells,
                    vec![digit],
                    AdvancedEvidenceKind::Fish {
                        bases: selected.iter().map(|unit| unit_identity(unit)).collect(),
                        covers: covering.iter().map(|unit| unit_identity(unit)).collect(),
                    },
                );
                let targets = covering
                    .iter()
                    .flat_map(|unit| unit.cells.iter().copied())
                    .filter(|cell| !selected.iter().any(|unit| unit.cells.contains(cell)))
                    .collect();
                let technique = if size == 2 {
                    Technique::XWing
                } else {
                    Technique::Swordfish
                };
                if let Some(step) = elimination(state, technique, evidence, targets, &[digit]) {
                    return Bounded::Complete(Some(step));
                }
            }
        }
    }
    Bounded::Complete(None)
}

fn find_xy_wing(state: &LogicalWorkspace, budget: &mut WorkBudget) -> StepOutcome {
    let bivalue: Vec<usize> = (0..BOARD_SIZE)
        .filter(|&cell| {
            state.board.values()[cell] == 0 && state.candidates[cell].bits().count_ones() == 2
        })
        .collect();
    for &pivot in &bivalue {
        let peers: Vec<usize> = bivalue
            .iter()
            .copied()
            .filter(|&cell| are_classic_peers(pivot, cell))
            .collect();
        for pair in combinations(&peers, 2) {
            if !budget.consume(1) {
                return Bounded::BudgetExhausted;
            }

            let first = pair[0];
            let second = pair[1];
            let pivot_mask = state.candidates[pivot].bits();
            let first_mask = state.candidates[first].bits();
            let second_mask = state.candidates[second].bits();
            let shared = digits_in(first_mask & second_mask & !pivot_mask);
            if shared.len() != 1
                || (first_mask & pivot_mask).count_ones() != 1
                || (second_mask & pivot_mask).count_ones() != 1
                || (first_mask & pivot_mask) == (second_mask & pivot_mask)
            {
                continue;
            }

            let evidence = pattern_evidence(
                state,
                vec![pivot, first, second],
                digits_in(pivot_mask | first_mask | second_mask),
                AdvancedEvidenceKind::Wing {
                    pivot,
                    wings: [first, second],
                },
            );
            let targets = (0..BOARD_SIZE)
                .filter(|&cell| {
                    are_classic_peers(first, cell)
                        && are_classic_peers(second, cell)
                        && cell != pivot
                })
                .collect();
            if let Some(step) = elimination(state, Technique::XYWing, evidence, targets, &shared) {
                return Bounded::Complete(Some(step));
            }
        }
    }
    Bounded::Complete(None)
}

fn find_simple_coloring(state: &LogicalWorkspace, budget: &mut WorkBudget) -> StepOutcome {
    for digit in 1..=9 {
        let mut links = vec![];
        for unit in &state.rules.context().units {
            if !budget.consume(1) {
                return Bounded::BudgetExhausted;
            }

            let cells = candidate_positions(state, &unit.cells, digit);
            if cells.len() == 2
                && !unit
                    .cells
                    .iter()
                    .any(|&cell| state.board.values()[cell] == digit)
            {
                links.push(ColoringLink {
                    unit: unit_identity(unit),
                    cells: [cells[0], cells[1]],
                });
            }
        }

        let mut visited = [false; BOARD_SIZE];
        for start in links.iter().flat_map(|link| link.cells) {
            if visited[start] {
                continue;
            }

            let mut assignments = [None; BOARD_SIZE];
            assignments[start] = Some(0_usize);
            let mut queue = vec![start];
            let mut contradictory = false;
            let mut index = 0;
            while index < queue.len() {
                let cell = queue[index];
                visited[cell] = true;
                for link in links.iter().filter(|link| link.cells.contains(&cell)) {
                    if !budget.consume(1) {
                        return Bounded::BudgetExhausted;
                    }
                    let other = if link.cells[0] == cell {
                        link.cells[1]
                    } else {
                        link.cells[0]
                    };
                    let opposite = if assignments[cell] == Some(0) { 1 } else { 0 };
                    if let Some(existing) = assignments[other] {
                        contradictory |= existing != opposite;
                    } else {
                        assignments[other] = Some(opposite);
                        queue.push(other);
                    }
                }
                index += 1;
            }

            let mut colors = [vec![], vec![]];
            for &cell in &queue {
                if assignments[cell] == Some(0) {
                    colors[0].push(cell);
                } else {
                    colors[1].push(cell);
                }
            }
            for group in &mut colors {
                group.sort_unstable();
            }

            let conflicts = [
                has_peer_collision(&colors[0]),
                has_peer_collision(&colors[1]),
            ];
            // Odd strong-link cycles and two impossible colors describe contradiction, never a hint.
            if contradictory || conflicts.iter().all(|&conflict| conflict) {
                continue;
            }

            let mode = if conflicts.iter().any(|&conflict| conflict) {
                ColoringMode::Wrap
            } else {
                ColoringMode::Trap
            };
            let targets = if mode == ColoringMode::Wrap {
                colors[if conflicts[0] { 0 } else { 1 }].clone()
            } else {
                (0..BOARD_SIZE)
                    .filter(|&cell| {
                        state.board.values()[cell] == 0
                            && state.candidates[cell].bits() & super::pattern_facts::mask_of(digit)
                                != 0
                            && assignments[cell].is_none()
                            && colors.iter().all(|group| {
                                group.iter().any(|&other| are_classic_peers(cell, other))
                            })
                    })
                    .collect()
            };
            let component_links = links
                .iter()
                .filter(|link| link.cells.iter().all(|&cell| assignments[cell].is_some()))
                .cloned()
                .collect();
            let evidence = pattern_evidence(
                state,
                queue,
                vec![digit],
                AdvancedEvidenceKind::Coloring {
                    mode,
                    colors,
                    links: component_links,
                },
            );
            if let Some(step) = elimination(
                state,
                Technique::SimpleColoring,
                evidence,
                targets,
                &[digit],
            ) {
                return Bounded::Complete(Some(step));
            }
        }
    }
    Bounded::Complete(None)
}

pub fn find_advanced_step(
    state: &LogicalWorkspace,
    technique: Technique,
    budget: &mut WorkBudget,
) -> StepOutcome {
    if !budget.consume(1) {
        return Bounded::BudgetExhausted;
    }
    if !matches!(state.rules.rules(), PuzzleRules::Classic) {
        return Bounded::Complete(None);
    }
    match technique {
        Technique::NakedTriple => find_triples(state, false, budget),
        Technique::HiddenTriple => find_triples(state, true, budget),
        Technique::XWing => find_fish(state, 2, budget),
        Technique::Swordfish => find_fish(state, 3, budget),
        Technique::XYWing => find_xy_wing(state, budget),
        Technique::SimpleColoring => find_simple_coloring(state, budget),
        _ => Bounded::Complete(None),
    }
}
