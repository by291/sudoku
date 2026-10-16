use crate::{
    BOARD_SIZE, Board, Budget, MAX_DIGIT, PreparedContext, SearchResult, UNIT_SIZE,
    calculate_candidates, mask_of, support::get_support,
};
use std::collections::VecDeque;

struct OrderedQueue {
    pending: VecDeque<usize>,
    present: Vec<bool>,
}

impl OrderedQueue {
    fn new(size: usize) -> Self {
        Self {
            pending: VecDeque::new(),
            present: vec![false; size],
        }
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
}

struct Search<'a> {
    context: &'a PreparedContext,
    domains: [u16; BOARD_SIZE],
    trail: Vec<(usize, u16)>,
    budget: Budget,
    node_limit: u64,
    nodes: u64,
    exhausted: bool,
    solutions: u8,
    solution: Option<Vec<u8>>,
}

impl Search<'_> {
    fn assign(&mut self, cell: usize, mask: u16) {
        if self.domains[cell] != mask {
            self.trail.push((cell, self.domains[cell]));
            self.domains[cell] = mask;
        }
    }

    fn undo(&mut self, mark: usize) {
        while self.trail.len() > mark {
            let (cell, previous) = self.trail.pop().expect("Trail length was checked");
            self.domains[cell] = previous;
        }
    }

    fn charge(&mut self) -> bool {
        if self.budget.charge() {
            return true;
        }
        self.exhausted = true;
        false
    }

    fn reduce(
        &mut self,
        cell: usize,
        mask: u16,
        cells: &mut Vec<usize>,
        units: &mut OrderedQueue,
        constraints: &mut OrderedQueue,
    ) -> bool {
        if mask == 0 {
            return false;
        }
        if mask == self.domains[cell] {
            return true;
        }

        self.assign(cell, mask);
        cells.push(cell);
        for &index in &self.context.cell_units[cell] {
            units.insert(index);
        }
        for &index in &self.context.cell_constraints[cell] {
            constraints.insert(index);
        }
        true
    }

    fn propagate(&mut self, changed: Option<usize>) -> bool {
        let context = self.context;
        let mut cells = changed.map_or_else(|| (0..BOARD_SIZE).collect(), |cell| vec![cell]);
        let mut units = OrderedQueue::new(context.topology.units.len());
        let mut constraints = OrderedQueue::new(context.topology.constraints.len());
        if let Some(cell) = changed {
            for &index in &context.cell_units[cell] {
                units.insert(index);
            }
            for &index in &context.cell_constraints[cell] {
                constraints.insert(index);
            }
        } else {
            for index in 0..context.topology.units.len() {
                units.insert(index);
            }
            for index in 0..context.topology.constraints.len() {
                constraints.insert(index);
            }
        }

        // FIFO deduplicated unit/clue queues preserve JavaScript Set insertion order.
        // The cell stack deliberately permits duplicates, preserving work charges.
        loop {
            while !cells.is_empty() {
                if !self.charge() {
                    return false;
                }
                let cell = cells.pop().expect("Cell stack length was checked");
                let mask = self.domains[cell];
                if mask == 0 {
                    return false;
                }
                if mask.count_ones() != 1 {
                    continue;
                }
                for &peer in &context.topology.duplicate_peers[cell] {
                    if !self.reduce(
                        peer,
                        self.domains[peer] & !mask,
                        &mut cells,
                        &mut units,
                        &mut constraints,
                    ) {
                        return false;
                    }
                }
            }

            if let Some(index) = units.pop() {
                if !self.charge() {
                    return false;
                }
                for digit in 1..=MAX_DIGIT {
                    let bit = mask_of(digit);
                    let mut positions = 0;
                    let mut last = 0;
                    for &cell in &context.topology.units[index] {
                        if self.domains[cell] & bit != 0 {
                            last = cell;
                            positions += 1;
                            if positions == 2 {
                                break;
                            }
                        }
                    }
                    if positions == 0 {
                        return false;
                    }
                    if positions == 1
                        && !self.reduce(last, bit, &mut cells, &mut units, &mut constraints)
                    {
                        return false;
                    }
                }
                continue;
            }

            let Some(index) = constraints.pop() else {
                return true;
            };
            if !self.charge() {
                return false;
            }
            let Some(supports) = get_support(&self.domains, context, index, &mut self.budget)
            else {
                self.exhausted = true;
                return false;
            };
            for (&cell, support) in context.topology.constraints[index]
                .cells
                .iter()
                .zip(supports)
            {
                if !self.reduce(
                    cell,
                    self.domains[cell] & support,
                    &mut cells,
                    &mut units,
                    &mut constraints,
                ) {
                    return false;
                }
            }
        }
    }

    fn visit(&mut self, changed: Option<usize>) {
        if self.nodes >= self.node_limit || !self.charge() {
            self.exhausted = true;
            return;
        }
        self.nodes += 1;
        if !self.propagate(changed) {
            return;
        }

        let mut target = None;
        let mut fewest = UNIT_SIZE as u32 + 1;
        for (cell, &mask) in self.domains.iter().enumerate() {
            let size = mask.count_ones();
            if size > 1 && size < fewest {
                target = Some(cell);
                fewest = size;
            }
        }

        let Some(target) = target else {
            let completed: Board = self.domains.map(|mask| (mask.trailing_zeros() + 1) as u8);
            if self.context.is_complete(&completed) {
                self.solutions += 1;
                if self.solution.is_none() {
                    self.solution = Some(completed.to_vec());
                }
            }
            return;
        };

        let choices = self.domains[target];
        for digit in 1..=MAX_DIGIT {
            let bit = mask_of(digit);
            if choices & bit == 0 {
                continue;
            }
            let mark = self.trail.len();
            self.assign(target, bit);
            self.visit(Some(target));
            self.undo(mark);
            if self.exhausted || self.solutions == 2 {
                return;
            }
        }
    }
}

pub(crate) fn count(
    board: &Board,
    context: &PreparedContext,
    nodes: u64,
    budget: Budget,
) -> SearchResult {
    let started = budget.used;
    let mut domains = calculate_candidates(board, context);
    for cell in 0..BOARD_SIZE {
        if board[cell] != 0 {
            domains[cell] = mask_of(board[cell]);
        }
    }
    let mut search = Search {
        context,
        domains,
        trail: Vec::new(),
        budget,
        node_limit: nodes,
        nodes: 0,
        exhausted: false,
        solutions: 0,
        solution: None,
    };
    search.visit(None);
    search.undo(0);

    let work_used = search.budget.used - started;
    if search.exhausted {
        SearchResult::BudgetExhausted {
            nodes_visited: search.nodes,
            work_used,
        }
    } else {
        SearchResult::Complete {
            count: search.solutions,
            solution: search.solution,
            nodes_visited: search.nodes,
            work_used,
        }
    }
}
