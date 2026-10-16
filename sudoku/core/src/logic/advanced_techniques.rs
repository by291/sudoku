use super::evidence::unit_identity;
use super::pattern_facts::{
    are_classic_peers, candidate_position_iter, has_peer_collision, mask_of,
};
use super::techniques::Technique;
use super::types::{
    AdvancedEvidence, AdvancedEvidenceKind, CandidateDomain, ColoringLink, ColoringMode, Evidence,
    LogicalAction, LogicalStep, LogicalWorkspace, Removal, StepOutcome,
};
use crate::budget::WorkBudget;
use crate::rules::types::{PuzzleRules, SudokuUnit, UnitKind};
use crate::types::{ALL_DIGITS_MASK, BOARD_SIZE, Bounded, CandidateMask, UNIT_SIZE};

// Lexicographic combinations preserve the reference's recursive traversal without allocating each choice.
fn combinations<T: Copy, const SIZE: usize>(values: &[T]) -> impl Iterator<Item = [T; SIZE]> + '_ {
    let mut indices: [usize; SIZE] = std::array::from_fn(|index| index);
    let mut finished = SIZE == 0 || SIZE > values.len();
    std::iter::from_fn(move || {
        if finished {
            return None;
        }

        let result = indices.map(|index| values[index]);
        let next = (0..SIZE)
            .rev()
            .find(|&index| indices[index] < values.len() - SIZE + index);
        if let Some(index) = next {
            indices[index] += 1;
            for offset in index + 1..SIZE {
                indices[offset] = indices[offset - 1] + 1;
            }
        } else {
            finished = true;
        }
        Some(result)
    })
}

fn selected_step(
    state: &LogicalWorkspace,
    technique: Technique,
    action: LogicalAction,
    cells: &[usize],
    digits: u16,
    kind: AdvancedEvidenceKind,
) -> StepOutcome {
    let mut cells = cells.to_vec();
    cells.sort_unstable();
    // Snapshot ownership begins only after finding an action. Replayed domains still prove premises independently.
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
    Bounded::Complete(Some(Box::new(LogicalStep {
        technique,
        evidence: Evidence::Advanced(AdvancedEvidence {
            cells,
            digits: CandidateMask::from_computed_bits(digits)
                .digits()
                .map(|digit| digit.value())
                .collect(),
            domains,
            kind,
        }),
        action,
    })))
}

fn elimination_action(
    state: &LogicalWorkspace,
    targets: impl IntoIterator<Item = usize>,
    digits: u16,
) -> Option<LogicalAction> {
    // The previous set explicitly sorted/deduplicated targets; ordered unit/path lists remain untouched.
    let mut selected = [false; BOARD_SIZE];
    for cell in targets {
        selected[cell] = true;
    }
    let mut removals = vec![];
    for (cell, &selected) in selected.iter().enumerate() {
        if !selected || state.board.values()[cell] != 0 {
            continue;
        }
        for digit in
            CandidateMask::from_computed_bits(state.candidates[cell].bits() & digits).digits()
        {
            removals.push(Removal {
                cell,
                digit: digit.value(),
            });
        }
    }
    if removals.is_empty() {
        None
    } else {
        Some(LogicalAction::Elimination { removals })
    }
}

fn find_triples(state: &LogicalWorkspace, hidden: bool, budget: &mut WorkBudget) -> StepOutcome {
    for unit in &state.rules.context().units {
        let mut empty = [0; UNIT_SIZE];
        let mut empty_count = 0;
        let mut choices = [0; UNIT_SIZE];
        let mut choice_count = 0;
        for &cell in &unit.cells {
            if state.board.values()[cell] == 0 {
                empty[empty_count] = cell;
                empty_count += 1;
                if (2..=3).contains(&state.candidates[cell].count()) {
                    choices[choice_count] = cell;
                    choice_count += 1;
                }
            }
        }
        if hidden {
            choices = std::array::from_fn(|index| index + 1);
            choice_count = UNIT_SIZE;
        }
        for choice in combinations::<_, 3>(&choices[..choice_count]) {
            if !budget.consume(1) {
                return Bounded::BudgetExhausted;
            }
            let digits = choice.iter().fold(0, |bits, &value| {
                bits | if hidden {
                    mask_of(value as u8)
                } else {
                    state.candidates[value].bits()
                }
            });
            if digits.count_ones() != 3 {
                continue;
            }

            let mut cells = choice;
            if hidden {
                let mut selected = [false; BOARD_SIZE];
                let mut possible = true;
                for digit in CandidateMask::from_computed_bits(digits).digits() {
                    let positions = candidate_position_iter(state, &unit.cells, digit.value());
                    if positions.clone().count() < 2 {
                        possible = false;
                    }
                    for cell in positions {
                        selected[cell] = true;
                    }
                }
                if !possible || selected.iter().filter(|&&present| present).count() != 3 {
                    continue;
                }
                for (position, cell) in selected
                    .iter()
                    .enumerate()
                    .filter_map(|(cell, &present)| present.then_some(cell))
                    .enumerate()
                {
                    cells[position] = cell;
                }
            }

            let (technique, action) = if hidden {
                (
                    Technique::HiddenTriple,
                    elimination_action(state, cells, ALL_DIGITS_MASK & !digits),
                )
            } else {
                (
                    Technique::NakedTriple,
                    elimination_action(
                        state,
                        empty[..empty_count]
                            .iter()
                            .copied()
                            .filter(|cell| !cells.contains(cell)),
                        digits,
                    ),
                )
            };
            if let Some(action) = action {
                return selected_step(
                    state,
                    technique,
                    action,
                    &cells,
                    digits,
                    AdvancedEvidenceKind::Subset {
                        unit: unit_identity(unit),
                        hidden,
                    },
                );
            }
        }
    }
    Bounded::Complete(None)
}

fn find_fish<const SIZE: usize>(state: &LogicalWorkspace, budget: &mut WorkBudget) -> StepOutcome {
    let units = &state.rules.context().units;
    for kind in [UnitKind::Row, UnitKind::Column] {
        let other_kind = if kind == UnitKind::Row {
            UnitKind::Column
        } else {
            UnitKind::Row
        };
        for digit in 1..=9 {
            let mut possible = [0; UNIT_SIZE];
            let mut possible_count = 0;
            for (index, unit) in units
                .iter()
                .enumerate()
                .filter(|(_, unit)| unit.kind == kind)
            {
                if (2..=SIZE).contains(&candidate_position_iter(state, &unit.cells, digit).count())
                {
                    possible[possible_count] = index;
                    possible_count += 1;
                }
            }
            for selected in combinations::<_, SIZE>(&possible[..possible_count]) {
                if !budget.consume(1) {
                    return Bounded::BudgetExhausted;
                }
                let mut cells = [0; UNIT_SIZE];
                let mut cell_count = 0;
                for &index in &selected {
                    for cell in candidate_position_iter(state, &units[index].cells, digit) {
                        cells[cell_count] = cell;
                        cell_count += 1;
                    }
                }
                let cells = &cells[..cell_count];
                let mut covering = [0; UNIT_SIZE];
                let mut cover_count = 0;
                for (index, unit) in units
                    .iter()
                    .enumerate()
                    .filter(|(_, unit)| unit.kind == other_kind)
                {
                    if cells.iter().any(|cell| unit.cells.contains(cell)) {
                        covering[cover_count] = index;
                        cover_count += 1;
                    }
                }
                if cover_count != SIZE {
                    continue;
                }
                let covering = &covering[..cover_count];
                let targets = covering
                    .iter()
                    .flat_map(|&index| units[index].cells.iter().copied())
                    .filter(|cell| {
                        !selected
                            .iter()
                            .any(|&index| units[index].cells.contains(cell))
                    });
                if let Some(action) = elimination_action(state, targets, mask_of(digit)) {
                    return selected_step(
                        state,
                        if SIZE == 2 {
                            Technique::XWing
                        } else {
                            Technique::Swordfish
                        },
                        action,
                        cells,
                        mask_of(digit),
                        AdvancedEvidenceKind::Fish {
                            bases: selected
                                .iter()
                                .map(|&index| unit_identity(&units[index]))
                                .collect(),
                            covers: covering
                                .iter()
                                .map(|&index| unit_identity(&units[index]))
                                .collect(),
                        },
                    );
                }
            }
        }
    }
    Bounded::Complete(None)
}

fn find_xy_wing(state: &LogicalWorkspace, budget: &mut WorkBudget) -> StepOutcome {
    let mut bivalue = [0; BOARD_SIZE];
    let mut bivalue_count = 0;
    for cell in 0..BOARD_SIZE {
        if state.board.values()[cell] == 0 && state.candidates[cell].count() == 2 {
            bivalue[bivalue_count] = cell;
            bivalue_count += 1;
        }
    }
    let bivalue = &bivalue[..bivalue_count];
    for &pivot in bivalue {
        let mut peers = [0; BOARD_SIZE];
        let mut peer_count = 0;
        for &cell in bivalue {
            if are_classic_peers(pivot, cell) {
                peers[peer_count] = cell;
                peer_count += 1;
            }
        }
        for [first, second] in combinations::<_, 2>(&peers[..peer_count]) {
            if !budget.consume(1) {
                return Bounded::BudgetExhausted;
            }
            let pivot_mask = state.candidates[pivot].bits();
            let first_mask = state.candidates[first].bits();
            let second_mask = state.candidates[second].bits();
            let shared = first_mask & second_mask & !pivot_mask;
            if shared.count_ones() != 1
                || (first_mask & pivot_mask).count_ones() != 1
                || (second_mask & pivot_mask).count_ones() != 1
                || (first_mask & pivot_mask) == (second_mask & pivot_mask)
            {
                continue;
            }
            let targets = (0..BOARD_SIZE).filter(|&cell| {
                are_classic_peers(first, cell) && are_classic_peers(second, cell) && cell != pivot
            });
            if let Some(action) = elimination_action(state, targets, shared) {
                return selected_step(
                    state,
                    Technique::XYWing,
                    action,
                    &[pivot, first, second],
                    pivot_mask | first_mask | second_mask,
                    AdvancedEvidenceKind::Wing {
                        pivot,
                        wings: [first, second],
                    },
                );
            }
        }
    }
    Bounded::Complete(None)
}

#[derive(Clone, Copy)]
struct StrongLink<'a> {
    unit: &'a SudokuUnit,
    cells: [usize; 2],
}

fn find_simple_coloring(state: &LogicalWorkspace, budget: &mut WorkBudget) -> StepOutcome {
    // Advanced detection is Classic-only: at most one strong link per each of its 27 units.
    const CLASSIC_UNIT_COUNT: usize = UNIT_SIZE * 3;
    for digit in 1..=9 {
        let mut links = [None; CLASSIC_UNIT_COUNT];
        let mut link_count = 0;
        for unit in &state.rules.context().units {
            if !budget.consume(1) {
                return Bounded::BudgetExhausted;
            }
            let mut positions = candidate_position_iter(state, &unit.cells, digit);
            if let (Some(first), Some(second), None) =
                (positions.next(), positions.next(), positions.next())
                && !unit
                    .cells
                    .iter()
                    .any(|&cell| state.board.values()[cell] == digit)
            {
                links[link_count] = Some(StrongLink {
                    unit,
                    cells: [first, second],
                });
                link_count += 1;
            }
        }
        let links = &links[..link_count];
        let mut visited = [false; BOARD_SIZE];
        for start in links.iter().flatten().flat_map(|link| link.cells) {
            if visited[start] {
                continue;
            }
            let mut assignments = [None; BOARD_SIZE];
            assignments[start] = Some(0_usize);
            let mut queue = [0; BOARD_SIZE];
            queue[0] = start;
            let mut queue_count = 1;
            let mut contradictory = false;
            let mut index = 0;
            while index < queue_count {
                let cell = queue[index];
                visited[cell] = true;
                for link in links
                    .iter()
                    .flatten()
                    .filter(|link| link.cells.contains(&cell))
                {
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
                        queue[queue_count] = other;
                        queue_count += 1;
                    }
                }
                index += 1;
            }
            let queue = &queue[..queue_count];
            let mut colors = [[0; BOARD_SIZE]; 2];
            let mut color_counts = [0; 2];
            for &cell in queue {
                let color = if assignments[cell] == Some(0) { 0 } else { 1 };
                colors[color][color_counts[color]] = cell;
                color_counts[color] += 1;
            }
            for (color, &count) in colors.iter_mut().zip(&color_counts) {
                color[..count].sort_unstable();
            }
            let colors = [&colors[0][..color_counts[0]], &colors[1][..color_counts[1]]];
            let conflicts = [has_peer_collision(colors[0]), has_peer_collision(colors[1])];
            // Odd strong-link cycles and two impossible colors describe contradiction, never a hint.
            if contradictory || conflicts.iter().all(|&conflict| conflict) {
                continue;
            }
            let mode = if conflicts.iter().any(|&conflict| conflict) {
                ColoringMode::Wrap
            } else {
                ColoringMode::Trap
            };
            let action = if mode == ColoringMode::Wrap {
                elimination_action(
                    state,
                    colors[if conflicts[0] { 0 } else { 1 }].iter().copied(),
                    mask_of(digit),
                )
            } else {
                let targets = (0..BOARD_SIZE).filter(|&cell| {
                    state.board.values()[cell] == 0
                        && state.candidates[cell].bits() & mask_of(digit) != 0
                        && assignments[cell].is_none()
                        && colors
                            .iter()
                            .all(|group| group.iter().any(|&other| are_classic_peers(cell, other)))
                });
                elimination_action(state, targets, mask_of(digit))
            };
            if let Some(action) = action {
                return selected_step(
                    state,
                    Technique::SimpleColoring,
                    action,
                    queue,
                    mask_of(digit),
                    AdvancedEvidenceKind::Coloring {
                        mode,
                        colors: colors.map(<[usize]>::to_vec),
                        links: links
                            .iter()
                            .flatten()
                            .filter(|link| {
                                link.cells.iter().all(|&cell| assignments[cell].is_some())
                            })
                            .map(|link| ColoringLink {
                                unit: unit_identity(link.unit),
                                cells: link.cells,
                            })
                            .collect(),
                    },
                );
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
        Technique::XWing => find_fish::<2>(state, budget),
        Technique::Swordfish => find_fish::<3>(state, budget),
        Technique::XYWing => find_xy_wing(state, budget),
        Technique::SimpleColoring => find_simple_coloring(state, budget),
        _ => Bounded::Complete(None),
    }
}
