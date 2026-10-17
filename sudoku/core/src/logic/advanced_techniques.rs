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

fn find_naked_triple(state: &LogicalWorkspace, budget: &mut WorkBudget) -> StepOutcome {
    for unit in &state.rules.context().units {
        let mut empty_cells = [0; UNIT_SIZE];
        let mut empty_count = 0;
        let mut eligible_cells = [0; UNIT_SIZE];
        let mut eligible_count = 0;
        for &cell in &unit.cells {
            if state.board.values()[cell] == 0 {
                empty_cells[empty_count] = cell;
                empty_count += 1;
                if (2..=3).contains(&state.candidates[cell].count()) {
                    eligible_cells[eligible_count] = cell;
                    eligible_count += 1;
                }
            }
        }

        // Charge each lexicographic cell combination, including rejected patterns.
        for cells in combinations::<_, 3>(&eligible_cells[..eligible_count]) {
            if !budget.consume(1) {
                return Bounded::BudgetExhausted;
            }
            let digits = cells
                .iter()
                .fold(0, |bits, &cell| bits | state.candidates[cell].bits());
            if digits.count_ones() != 3 {
                continue;
            }

            let targets = empty_cells[..empty_count]
                .iter()
                .copied()
                .filter(|cell| !cells.contains(cell));
            if let Some(action) = elimination_action(state, targets, digits) {
                return selected_step(
                    state,
                    Technique::NakedTriple,
                    action,
                    &cells,
                    digits,
                    AdvancedEvidenceKind::Subset {
                        unit: unit_identity(unit),
                        hidden: false,
                    },
                );
            }
        }
    }
    Bounded::Complete(None)
}

fn find_hidden_triple(state: &LogicalWorkspace, budget: &mut WorkBudget) -> StepOutcome {
    let all_digits: [u8; UNIT_SIZE] = std::array::from_fn(|index| (index + 1) as u8);
    for unit in &state.rules.context().units {
        // Hidden triples visit all lexicographic digit triples, even in sparse/contradictory states.
        for selected_digits in combinations::<_, 3>(&all_digits) {
            if !budget.consume(1) {
                return Bounded::BudgetExhausted;
            }
            let digits = selected_digits
                .iter()
                .fold(0, |bits, &digit| bits | mask_of(digit));
            let mut selected_cells = [false; BOARD_SIZE];
            let mut possible = true;
            for digit in selected_digits {
                let positions = candidate_position_iter(state, &unit.cells, digit);
                if positions.clone().count() < 2 {
                    possible = false;
                }
                for cell in positions {
                    selected_cells[cell] = true;
                }
            }
            if !possible || selected_cells.iter().filter(|&&present| present).count() != 3 {
                continue;
            }

            let mut cells = [0; 3];
            for (position, cell) in selected_cells
                .iter()
                .enumerate()
                .filter_map(|(cell, &present)| present.then_some(cell))
                .enumerate()
            {
                cells[position] = cell;
            }
            if let Some(action) = elimination_action(state, cells, ALL_DIGITS_MASK & !digits) {
                return selected_step(
                    state,
                    Technique::HiddenTriple,
                    action,
                    &cells,
                    digits,
                    AdvancedEvidenceKind::Subset {
                        unit: unit_identity(unit),
                        hidden: true,
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

// Advanced detection is Classic-only: one strong link at most per each of its 27 units.
const CLASSIC_UNIT_COUNT: usize = UNIT_SIZE * 3;

struct ColoringGraph<'a> {
    links: [Option<StrongLink<'a>>; CLASSIC_UNIT_COUNT],
    link_count: usize,
}

fn build_coloring_graph<'a>(
    state: &'a LogicalWorkspace,
    digit: u8,
    budget: &mut WorkBudget,
) -> Bounded<ColoringGraph<'a>> {
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

    Bounded::Complete(ColoringGraph { links, link_count })
}

struct ColoringComponent {
    assignments: [Option<usize>; BOARD_SIZE],
    queue: [usize; BOARD_SIZE],
    queue_count: usize,
    colors: [[usize; BOARD_SIZE]; 2],
    color_counts: [usize; 2],
    contradictory: bool,
}

fn color_component(
    links: &[Option<StrongLink<'_>>],
    start: usize,
    visited: &mut [bool; BOARD_SIZE],
    budget: &mut WorkBudget,
) -> Bounded<ColoringComponent> {
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

    let queued_cells = &queue[..queue_count];
    let mut colors = [[0; BOARD_SIZE]; 2];
    let mut color_counts = [0; 2];
    for &cell in queued_cells {
        let color = if assignments[cell] == Some(0) { 0 } else { 1 };
        colors[color][color_counts[color]] = cell;
        color_counts[color] += 1;
    }
    for (color, &count) in colors.iter_mut().zip(&color_counts) {
        color[..count].sort_unstable();
    }

    Bounded::Complete(ColoringComponent {
        assignments,
        queue,
        queue_count,
        colors,
        color_counts,
        contradictory,
    })
}

fn coloring_action(
    state: &LogicalWorkspace,
    digit: u8,
    component: &ColoringComponent,
) -> Option<(ColoringMode, LogicalAction)> {
    let colors = [
        &component.colors[0][..component.color_counts[0]],
        &component.colors[1][..component.color_counts[1]],
    ];
    let conflicts = [has_peer_collision(colors[0]), has_peer_collision(colors[1])];
    // Odd strong-link cycles and two impossible colors describe contradiction, never a hint.
    if component.contradictory || conflicts.iter().all(|&conflict| conflict) {
        return None;
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
                && component.assignments[cell].is_none()
                && colors
                    .iter()
                    .all(|group| group.iter().any(|&other| are_classic_peers(cell, other)))
        });
        elimination_action(state, targets, mask_of(digit))
    };

    action.map(|action| (mode, action))
}

fn coloring_evidence(
    links: &[Option<StrongLink<'_>>],
    component: &ColoringComponent,
    mode: ColoringMode,
) -> AdvancedEvidenceKind {
    let colors = [
        &component.colors[0][..component.color_counts[0]],
        &component.colors[1][..component.color_counts[1]],
    ];
    AdvancedEvidenceKind::Coloring {
        mode,
        colors: colors.map(<[usize]>::to_vec),
        links: links
            .iter()
            .flatten()
            .filter(|link| {
                link.cells
                    .iter()
                    .all(|&cell| component.assignments[cell].is_some())
            })
            .map(|link| ColoringLink {
                unit: unit_identity(link.unit),
                cells: link.cells,
            })
            .collect(),
    }
}

fn find_simple_coloring(state: &LogicalWorkspace, budget: &mut WorkBudget) -> StepOutcome {
    for digit in 1..=9 {
        let Bounded::Complete(graph) = build_coloring_graph(state, digit, budget) else {
            return Bounded::BudgetExhausted;
        };
        let links = &graph.links[..graph.link_count];
        let mut visited = [false; BOARD_SIZE];
        // Link order, BFS insertion order and per-edge charges determine the v11 first witness.
        for start in links.iter().flatten().flat_map(|link| link.cells) {
            if visited[start] {
                continue;
            }
            let Bounded::Complete(component) = color_component(links, start, &mut visited, budget)
            else {
                return Bounded::BudgetExhausted;
            };
            if let Some((mode, action)) = coloring_action(state, digit, &component) {
                return selected_step(
                    state,
                    Technique::SimpleColoring,
                    action,
                    &component.queue[..component.queue_count],
                    mask_of(digit),
                    coloring_evidence(links, &component, mode),
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
        Technique::NakedTriple => find_naked_triple(state, budget),
        Technique::HiddenTriple => find_hidden_triple(state, budget),
        Technique::XWing => find_fish::<2>(state, budget),
        Technique::Swordfish => find_fish::<3>(state, budget),
        Technique::XYWing => find_xy_wing(state, budget),
        Technique::SimpleColoring => find_simple_coloring(state, budget),
        _ => Bounded::Complete(None),
    }
}
