use std::collections::VecDeque;

use super::types::SearchResult;
use crate::board::{base_candidates, is_complete};
use crate::budget::WorkBudget;
use crate::constraints::types::PreparedComputation;
use crate::types::{BOARD_SIZE, Board, Bounded, CandidateMask, UNIT_SIZE};

// JS Set semantics: pop removes membership immediately; reinsertion appends to the tail.
struct OrderedQueue {
    pending: VecDeque<usize>,
    present: Vec<bool>,
}

impl OrderedQueue {
    fn new(length: usize) -> Self {
        Self {
            pending: VecDeque::new(),
            present: vec![false; length],
        }
    }

    fn clear(&mut self) {
        self.pending.clear();
        self.present.fill(false);
    }

    fn insert(&mut self, index: usize) {
        if !self.present[index] {
            self.present[index] = true;
            self.pending.push_back(index);
        }
    }

    fn pop(&mut self) -> Option<usize> {
        let index = self.pending.pop_front()?;
        self.present[index] = false;
        Some(index)
    }

    fn is_empty(&self) -> bool {
        self.pending.is_empty()
    }
}

struct Queues {
    cells: Vec<usize>,
    units: OrderedQueue,
    constraints: OrderedQueue,
}

impl Queues {
    fn new(computation: &PreparedComputation) -> Self {
        Self {
            cells: Vec::with_capacity(BOARD_SIZE),
            units: OrderedQueue::new(computation.rules.context().units.len()),
            constraints: OrderedQueue::new(computation.rules.context().constraints.len()),
        }
    }

    fn clear(&mut self) {
        self.cells.clear();
        self.units.clear();
        self.constraints.clear();
    }
}

struct DomainChange {
    cell: usize,
    previous: CandidateMask,
}

enum DigitPositions {
    Missing,
    One(usize),
    Multiple,
}

struct SearchState<'a> {
    computation: &'a PreparedComputation,
    budget: &'a mut WorkBudget,
    domains: [CandidateMask; BOARD_SIZE],
    trail: Vec<DomainChange>,
    unassigned: Board,
    exhausted: bool,
    node_limit: u64,
    nodes_visited: u64,
    count: u8,
    solution: Option<Board>,
}

impl SearchState<'_> {
    fn assign(&mut self, cell: usize, mask: CandidateMask) {
        if self.domains[cell] != mask {
            self.trail.push(DomainChange {
                cell,
                previous: self.domains[cell],
            });
            self.domains[cell] = mask;
        }
    }

    fn undo(&mut self, mark: usize) {
        for change in self.trail.drain(mark..).rev() {
            self.domains[change.cell] = change.previous;
        }
    }

    fn charge(&mut self) -> bool {
        if !self.budget.consume(1) {
            self.exhausted = true;
            return false;
        }
        true
    }

    fn reduce(&mut self, cell: usize, bits: u16, queues: &mut Queues) -> bool {
        if bits == 0 {
            return false;
        }
        if bits == self.domains[cell].bits() {
            return true;
        }
        self.assign(cell, CandidateMask::from_computed_bits(bits));
        // Cell visits intentionally allow duplicates; unit and clue visits use ordered deduplication.
        queues.cells.push(cell);
        for &index in &self.computation.rules.context().cell_units[cell] {
            queues.units.insert(index);
        }
        for &index in &self.computation.rules.context().cell_constraints[cell] {
            queues.constraints.insert(index);
        }
        true
    }

    fn propagate(&mut self, changed_cell: Option<usize>, queues: &mut Queues) -> bool {
        let computation = self.computation;
        let context = computation.rules.context();
        // A contradiction can leave all three queues pending; siblings always start with empty membership.
        queues.clear();
        if let Some(cell) = changed_cell {
            queues.cells.push(cell);
            for &index in &context.cell_units[cell] {
                queues.units.insert(index);
            }
            for &index in &context.cell_constraints[cell] {
                queues.constraints.insert(index);
            }
        } else {
            queues.cells.extend(0..BOARD_SIZE);
            for index in 0..context.units.len() {
                queues.units.insert(index);
            }
            for index in 0..context.constraints.len() {
                queues.constraints.insert(index);
            }
        }

        while !queues.cells.is_empty() || !queues.units.is_empty() || !queues.constraints.is_empty()
        {
            while let Some(cell) = queues.cells.pop() {
                if !self.charge() {
                    return false;
                }
                let mask = self.domains[cell].bits();
                if mask == 0 {
                    return false;
                }
                if mask & (mask - 1) != 0 {
                    continue;
                }
                for &peer in &context.duplicate_peers[cell] {
                    if !self.reduce(peer, self.domains[peer].bits() & !mask, queues) {
                        return false;
                    }
                }
            }

            if let Some(index) = queues.units.pop() {
                // Only full nine-digit units require every digit; arithmetic clues use their own queue.
                if !self.charge() {
                    return false;
                }
                for digit in 1..=UNIT_SIZE {
                    let bit = 1 << (digit - 1);
                    let mut positions = DigitPositions::Missing;
                    for &cell in &context.units[index].cells {
                        if self.domains[cell].bits() & bit != 0 {
                            positions = match positions {
                                DigitPositions::Missing => DigitPositions::One(cell),
                                DigitPositions::One(_) | DigitPositions::Multiple => {
                                    DigitPositions::Multiple
                                }
                            };
                            if matches!(positions, DigitPositions::Multiple) {
                                break;
                            }
                        }
                    }
                    match positions {
                        DigitPositions::Missing => return false,
                        DigitPositions::One(cell) => {
                            if !self.reduce(cell, bit, queues) {
                                return false;
                            }
                        }
                        DigitPositions::Multiple => {}
                    }
                }
                continue;
            }

            let Some(index) = queues.constraints.pop() else {
                continue;
            };
            if !self.charge() {
                return false;
            }
            let result =
                computation
                    .support
                    .query_at(&self.unassigned, &self.domains, index, self.budget);
            let Bounded::Complete(support) = result else {
                self.exhausted = true;
                return false;
            };
            for (&cell, mask) in context.constraints[index]
                .cells()
                .iter()
                .zip(support.as_slice())
            {
                if !self.reduce(cell, self.domains[cell].bits() & mask, queues) {
                    return false;
                }
            }
        }
        true
    }

    fn visit(&mut self, changed_cell: Option<usize>, queues: &mut Queues) {
        if self.nodes_visited >= self.node_limit || !self.charge() {
            self.exhausted = true;
            return;
        }
        self.nodes_visited += 1;
        if !self.propagate(changed_cell, queues) {
            return;
        }

        let mut target = None;
        let mut fewest = UNIT_SIZE as u32 + 1;
        for cell in 0..BOARD_SIZE {
            let size = self.domains[cell].bits().count_ones();
            if size > 1 && size < fewest {
                target = Some(cell);
                fewest = size;
            }
        }
        let Some(target) = target else {
            let values =
                std::array::from_fn(|cell| (self.domains[cell].bits().trailing_zeros() + 1) as u8);
            let completed = Board::from_computed_values(values);
            if is_complete(&completed, &self.computation.rules) {
                self.count = if self.count == 0 { 1 } else { 2 };
                if self.solution.is_none() {
                    self.solution = Some(completed);
                }
            }
            return;
        };

        let choices = self.domains[target].bits();
        for digit in 1..=UNIT_SIZE {
            let bit = 1 << (digit - 1);
            if choices & bit == 0 {
                continue;
            }
            let mark = self.trail.len();
            self.assign(target, CandidateMask::from_computed_bits(bit));
            {
                let guard = TrailGuard { state: self, mark };
                guard.state.visit(Some(target), queues);
            }
            if self.exhausted || self.count == 2 {
                return;
            }
        }
    }
}

// Branches restore domains on every exit; probe-owned queues are cleared before each propagation.
struct TrailGuard<'state, 'layout> {
    state: &'state mut SearchState<'layout>,
    mark: usize,
}

impl Drop for TrailGuard<'_, '_> {
    fn drop(&mut self) {
        self.state.undo(self.mark);
    }
}

pub(super) fn count_propagation_solutions(
    board: &Board,
    computation: &PreparedComputation,
    budget: &mut WorkBudget,
    node_limit: u64,
) -> SearchResult {
    let started = budget.used();
    let base = base_candidates(board, &computation.rules);
    // Search uses singleton domains for givens; presentation candidates use zero for filled cells.
    let domains = std::array::from_fn(|cell| {
        if board.values()[cell] == 0 {
            base[cell]
        } else {
            CandidateMask::from_computed_bits(1 << (board.values()[cell] - 1))
        }
    });
    let mut state = SearchState {
        computation,
        budget,
        domains,
        trail: vec![],
        unassigned: Board::EMPTY,
        exhausted: false,
        node_limit,
        nodes_visited: 0,
        count: 0,
        solution: None,
    };
    let mut queues = Queues::new(computation);
    {
        let guard = TrailGuard {
            state: &mut state,
            mark: 0,
        };
        guard.state.visit(None, &mut queues);
    }
    let work_used = state.budget.used() - started;
    if state.exhausted {
        SearchResult::BudgetExhausted {
            nodes_visited: state.nodes_visited,
            work_used,
        }
    } else {
        SearchResult::Complete {
            count: state.count,
            solution: state.solution,
            nodes_visited: state.nodes_visited,
            work_used,
        }
    }
}
