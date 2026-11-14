use super::evidence::unit_identity;
use super::pattern_facts::{
    are_classic_peers, candidate_position_iter, has_peer_collision, mask_of,
};
use super::techniques::Technique;
use super::types::{
    AdvancedEvidence, AdvancedEvidenceKind, CandidateDomain, ColoringLink, ColoringMode, Evidence,
    LogicalAction, LogicalStep, LogicalWorkspace, Removal, StepOutcome,
};
use crate::control::ExecutionControl;
use crate::rules::types::{PuzzleRules, SudokuUnit, UnitKind};
use crate::types::{ALL_DIGITS_MASK, BOARD_SIZE, Bounded, CandidateMask, UNIT_SIZE};

// Advanced detection is Classic-only, with at most one strong link per full unit.
const CLASSIC_UNIT_COUNT: usize = UNIT_SIZE * 3;
const X_WING_SIZE: usize = 2;
const SWORDFISH_SIZE: usize = 3;

// Lexicographic traversal keeps the first selected witness stable.
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

struct SelectedStep<'a> {
    state: &'a LogicalWorkspace,
    technique: Technique,
    action: LogicalAction,
    cells: &'a [usize],
    digits: u16,
    kind: AdvancedEvidenceKind,
}

fn selected_step(selection: SelectedStep<'_>) -> LogicalStep {
    let SelectedStep {
        state,
        technique,
        action,
        cells,
        digits,
        kind,
    } = selection;
    let mut cells = cells.to_vec();
    cells.sort_unstable();

    // Capture the pre-action domains so replay can verify the witness independently.
    let indexed_candidates = state.candidates.iter().enumerate();
    let domains = indexed_candidates
        .map(|(cell, &mask)| CandidateDomain {
            cell,
            mask: if state.board.values()[cell] == 0 {
                mask
            } else {
                CandidateMask::EMPTY
            },
        })
        .collect();

    let digits = CandidateMask::from_computed_bits(digits);
    LogicalStep {
        technique,
        evidence: Evidence::Advanced(AdvancedEvidence {
            cells,
            digits: digits.digits().map(|digit| digit.value()).collect(),
            domains,
            kind,
        }),
        action,
    }
}

fn elimination_action(
    state: &LogicalWorkspace,
    targets: impl IntoIterator<Item = usize>,
    digits: u16,
) -> Option<LogicalAction> {
    // Visit each removal target once in cell order, independent of witness traversal order.
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

fn find_naked_triple(state: &LogicalWorkspace, control: &mut ExecutionControl) -> StepOutcome {
    for unit in &state.rules.context().units {
        let mut empty_cells = [0; UNIT_SIZE];
        let mut empty_count = 0;
        let mut eligible_cells = [0; UNIT_SIZE];
        let mut eligible_count = 0;
        for &cell in &unit.cells {
            if state.board.values()[cell] != 0 {
                continue;
            }

            empty_cells[empty_count] = cell;
            empty_count += 1;
            if (2..=3).contains(&state.candidates[cell].count()) {
                eligible_cells[eligible_count] = cell;
                eligible_count += 1;
            }
        }

        // Check cancellation even when no visited combination yields a deduction.
        for cells in combinations::<_, 3>(&eligible_cells[..eligible_count]) {
            if !control.check() {
                return Bounded::Cancelled;
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
                let step = selected_step(SelectedStep {
                    state,
                    technique: Technique::NakedTriple,
                    action,
                    cells: &cells,
                    digits,
                    kind: AdvancedEvidenceKind::Subset {
                        unit: unit_identity(unit),
                        hidden: false,
                    },
                });
                return Bounded::Complete(Some(Box::new(step)));
            }
        }
    }
    Bounded::Complete(None)
}

fn find_hidden_triple(state: &LogicalWorkspace, control: &mut ExecutionControl) -> StepOutcome {
    let all_digits: [u8; UNIT_SIZE] = std::array::from_fn(|index| (index + 1) as u8);
    let global_positions = state.digit_positions();
    for (index, unit) in state.rules.context().units.iter().enumerate() {
        let positions =
            global_positions.map(|positions| positions & state.rules.unit_masks()[index]);

        // Keep the same traversal in sparse states so each digit triple remains a checkpoint.
        for selected_digits in combinations::<_, 3>(&all_digits) {
            if !control.check() {
                return Bounded::Cancelled;
            }

            let digits = selected_digits
                .iter()
                .fold(0, |bits, &digit| bits | mask_of(digit));
            let selected = selected_digits.map(|digit| positions[usize::from(digit - 1)]);
            let mut mask = selected
                .iter()
                .fold(0_u128, |mask, positions| mask | positions);
            if selected.iter().any(|positions| positions.count_ones() < 2) || mask.count_ones() != 3
            {
                continue;
            }

            let cells: [usize; 3] = std::array::from_fn(|_| {
                let cell = mask.trailing_zeros() as usize;
                mask &= mask - 1;
                cell
            });
            if let Some(action) = elimination_action(state, cells, ALL_DIGITS_MASK & !digits) {
                let step = selected_step(SelectedStep {
                    state,
                    technique: Technique::HiddenTriple,
                    action,
                    cells: &cells,
                    digits,
                    kind: AdvancedEvidenceKind::Subset {
                        unit: unit_identity(unit),
                        hidden: true,
                    },
                });
                return Bounded::Complete(Some(Box::new(step)));
            }
        }
    }
    Bounded::Complete(None)
}

struct FishPattern<'a> {
    digit: u8,
    cover_kind: UnitKind,
    bases: &'a [usize],
}

fn fish_bases<const SIZE: usize>(
    state: &LogicalWorkspace,
    kind: UnitKind,
    digit: u8,
) -> ([usize; UNIT_SIZE], usize) {
    let units = &state.rules.context().units;
    let mut possible = [0; UNIT_SIZE];
    let mut possible_count = 0;
    for (index, unit) in units
        .iter()
        .enumerate()
        .filter(|(_, unit)| unit.kind == kind)
    {
        if (2..=SIZE).contains(&candidate_position_iter(state, &unit.cells, digit).count()) {
            possible[possible_count] = index;
            possible_count += 1;
        }
    }
    (possible, possible_count)
}

fn fish_step(state: &LogicalWorkspace, pattern: FishPattern<'_>) -> Option<LogicalStep> {
    let units = &state.rules.context().units;
    let mut cells = [0; UNIT_SIZE];
    let mut cell_count = 0;
    for &index in pattern.bases {
        for cell in candidate_position_iter(state, &units[index].cells, pattern.digit) {
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
        .filter(|(_, unit)| unit.kind == pattern.cover_kind)
    {
        if cells.iter().any(|cell| unit.cells.contains(cell)) {
            covering[cover_count] = index;
            cover_count += 1;
        }
    }

    // Each base needs a distinct cover for the digit, so the fish consumes every cover.
    if cover_count != pattern.bases.len() {
        return None;
    }

    let covering = &covering[..cover_count];
    let targets = covering
        .iter()
        .flat_map(|&index| units[index].cells.iter().copied())
        .filter(|cell| {
            !pattern
                .bases
                .iter()
                .any(|&index| units[index].cells.contains(cell))
        });
    let digits = mask_of(pattern.digit);
    let action = elimination_action(state, targets, digits)?;

    let technique = if pattern.bases.len() == X_WING_SIZE {
        Technique::XWing
    } else {
        Technique::Swordfish
    };
    let kind = AdvancedEvidenceKind::Fish {
        bases: pattern
            .bases
            .iter()
            .map(|&index| unit_identity(&units[index]))
            .collect(),
        covers: covering
            .iter()
            .map(|&index| unit_identity(&units[index]))
            .collect(),
    };
    Some(selected_step(SelectedStep {
        state,
        technique,
        action,
        cells,
        digits,
        kind,
    }))
}

fn find_oriented_fish<const SIZE: usize>(
    state: &LogicalWorkspace,
    base_kind: UnitKind,
    control: &mut ExecutionControl,
) -> StepOutcome {
    let cover_kind = if base_kind == UnitKind::Row {
        UnitKind::Column
    } else {
        UnitKind::Row
    };

    for digit in 1..=UNIT_SIZE as u8 {
        let (possible, possible_count) = fish_bases::<SIZE>(state, base_kind, digit);

        // Keep the checkpoint for every combination, including rejected cover sets.
        for selected in combinations::<_, SIZE>(&possible[..possible_count]) {
            if !control.check() {
                return Bounded::Cancelled;
            }

            let pattern = FishPattern {
                digit,
                cover_kind,
                bases: &selected,
            };
            if let Some(step) = fish_step(state, pattern) {
                return Bounded::Complete(Some(Box::new(step)));
            }
        }
    }

    Bounded::Complete(None)
}

fn find_fish<const SIZE: usize>(
    state: &LogicalWorkspace,
    control: &mut ExecutionControl,
) -> StepOutcome {
    // Rows precede columns so the detector selects the same first witness.
    for kind in [UnitKind::Row, UnitKind::Column] {
        let outcome = find_oriented_fish::<SIZE>(state, kind, control);
        if !matches!(outcome, Bounded::Complete(None)) {
            return outcome;
        }
    }

    Bounded::Complete(None)
}

fn find_xy_wing(state: &LogicalWorkspace, control: &mut ExecutionControl) -> StepOutcome {
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
            if !control.check() {
                return Bounded::Cancelled;
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
                let wing_cells = [
                    // The pivot supplies the two alternatives that force a wing.
                    pivot, first, second,
                ];
                let step = selected_step(SelectedStep {
                    state,
                    technique: Technique::XYWing,
                    action,
                    cells: &wing_cells,
                    digits: pivot_mask | first_mask | second_mask,
                    kind: AdvancedEvidenceKind::Wing {
                        pivot,
                        wings: [first, second],
                    },
                });
                return Bounded::Complete(Some(Box::new(step)));
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

struct ColoringGraph<'a> {
    links: [Option<StrongLink<'a>>; CLASSIC_UNIT_COUNT],
    link_count: usize,
}

fn build_coloring_graph<'a>(
    state: &'a LogicalWorkspace,
    digit: u8,
    control: &mut ExecutionControl,
) -> Bounded<ColoringGraph<'a>> {
    let mut links = [None; CLASSIC_UNIT_COUNT];
    let mut link_count = 0;
    for unit in &state.rules.context().units {
        if !control.check() {
            return Bounded::Cancelled;
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

struct ColorSearch<'a, 'graph> {
    links: &'a [Option<StrongLink<'graph>>],
    start: usize,
    visited: &'a mut [bool; BOARD_SIZE],
    control: &'a mut ExecutionControl,
}

fn color_component(search: ColorSearch<'_, '_>) -> Bounded<ColoringComponent> {
    let ColorSearch {
        links,
        start,
        visited,
        control,
    } = search;
    let mut assignments = [None; BOARD_SIZE];
    assignments[start] = Some(0_usize);
    let mut queue = [0; BOARD_SIZE];
    queue[0] = start;
    let mut queue_count = 1;
    let mut has_contradiction = false;
    let mut index = 0;

    while index < queue_count {
        let cell = queue[index];
        visited[cell] = true;
        for link in links
            .iter()
            .flatten()
            .filter(|link| link.cells.contains(&cell))
        {
            if !control.check() {
                return Bounded::Cancelled;
            }
            let other = if link.cells[0] == cell {
                link.cells[1]
            } else {
                link.cells[0]
            };

            // A strong link forces its endpoints to use opposite colors.
            let opposite = match assignments[cell] {
                Some(0) => 1,
                _ => 0,
            };
            if let Some(existing) = assignments[other] {
                has_contradiction |= existing != opposite;
                continue;
            }

            assignments[other] = Some(opposite);
            queue[queue_count] = other;
            queue_count += 1;
        }
        index += 1;
    }

    let queued_cells = &queue[..queue_count];
    let mut colors = [[0; BOARD_SIZE]; 2];
    let mut color_counts = [0; 2];
    for &cell in queued_cells {
        let color = match assignments[cell] {
            Some(0) => 0,
            _ => 1,
        };
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
        contradictory: has_contradiction,
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
        let conflicting_cells = match conflicts[0] {
            true => colors[0],
            false => colors[1],
        };
        elimination_action(state, conflicting_cells.iter().copied(), mask_of(digit))
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
    let component_links = links.iter().flatten().filter(|link| {
        link.cells
            .iter()
            .all(|&cell| component.assignments[cell].is_some())
    });

    AdvancedEvidenceKind::Coloring {
        mode,
        colors: colors.map(<[usize]>::to_vec),
        links: component_links
            .map(|link| ColoringLink {
                unit: unit_identity(link.unit),
                cells: link.cells,
            })
            .collect(),
    }
}

fn find_simple_coloring(state: &LogicalWorkspace, control: &mut ExecutionControl) -> StepOutcome {
    for digit in 1..=UNIT_SIZE as u8 {
        let Bounded::Complete(graph) = build_coloring_graph(state, digit, control) else {
            return Bounded::Cancelled;
        };
        let links = &graph.links[..graph.link_count];
        let mut visited = [false; BOARD_SIZE];
        // Link order and BFS insertion order determine the first witness.
        for start in links.iter().flatten().flat_map(|link| link.cells) {
            if visited[start] {
                continue;
            }

            let search = ColorSearch {
                links,
                start,
                visited: &mut visited,
                control,
            };
            let Bounded::Complete(component) = color_component(search) else {
                return Bounded::Cancelled;
            };

            if let Some((mode, action)) = coloring_action(state, digit, &component) {
                let step = selected_step(SelectedStep {
                    state,
                    technique: Technique::SimpleColoring,
                    action,
                    cells: &component.queue[..component.queue_count],
                    digits: mask_of(digit),
                    kind: coloring_evidence(links, &component, mode),
                });
                return Bounded::Complete(Some(Box::new(step)));
            }
        }
    }
    Bounded::Complete(None)
}

/// Search for one Classic advanced deduction, honoring cooperative cancellation.
pub fn find_advanced_step(
    state: &LogicalWorkspace,
    technique: Technique,
    control: &mut ExecutionControl,
) -> StepOutcome {
    if !control.check() {
        return Bounded::Cancelled;
    }
    if !matches!(state.rules.rules(), PuzzleRules::Classic) {
        return Bounded::Complete(None);
    }

    match technique {
        Technique::NakedTriple => find_naked_triple(state, control),
        Technique::HiddenTriple => find_hidden_triple(state, control),
        Technique::XWing => find_fish::<X_WING_SIZE>(state, control),
        Technique::Swordfish => find_fish::<SWORDFISH_SIZE>(state, control),
        Technique::XYWing => find_xy_wing(state, control),
        Technique::SimpleColoring => find_simple_coloring(state, control),
        _ => Bounded::Complete(None),
    }
}
