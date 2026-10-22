use std::sync::Arc;

use super::cage_catalogue::{self, CatalogueResult};
use super::types::{
    CatalogueLimits, MAX_CATALOGUE_CELLS, MAX_CONSTRAINT_CELLS, PreparedConstraintSupport,
    SupportLayout, SupportMasks, SupportMasksResult, SupportResult,
};
use crate::control::ExecutionControl;
use crate::rules::types::{PreparedRules, RuleConstraint};
use crate::types::{BOARD_SIZE, Board, Bounded, CandidateMask, CoreResult, EngineError, UNIT_SIZE};

struct Enumerator<'a> {
    constraint: &'a RuleConstraint,
    domains: [u16; MAX_CONSTRAINT_CELLS],
    assigned: [u8; MAX_CONSTRAINT_CELLS],
    supports: SupportMasks,
    prefix_peers: [u16; MAX_CONSTRAINT_CELLS],
    suffix_minimum: [u16; MAX_CONSTRAINT_CELLS + 1],
    suffix_maximum: [u16; MAX_CONSTRAINT_CELLS + 1],
    suffix_empty: [bool; MAX_CONSTRAINT_CELLS + 1],
    exhausted: bool,
    control: &'a mut ExecutionControl,
}

impl Enumerator<'_> {
    fn plausible(&self, position: usize, sum: u16) -> bool {
        let digit = self.assigned[position];
        // Accepted prefix pairs already passed this relation. Arrow repeats remain legal for non-peers.
        for previous in 0..position {
            if self.prefix_peers[position] & (1 << previous) != 0
                && self.assigned[previous] == digit
            {
                return false;
            }
        }
        let target = match self.constraint {
            RuleConstraint::Thermo { .. } => {
                return (position == 0 || digit > self.assigned[position - 1])
                    && usize::from(digit) <= UNIT_SIZE - (self.supports.len - position - 1);
            }
            RuleConstraint::Arrow { .. } => u16::from(self.assigned[0]),
            RuleConstraint::Cage { sum, .. } => *sum,
        };
        let next = position + 1;
        !self.suffix_empty[next]
            && sum + self.suffix_minimum[next] <= target
            && sum + self.suffix_maximum[next] >= target
    }

    fn visit(&mut self, position: usize, sum: u16) {
        if self.exhausted {
            return;
        }
        if position == self.supports.len {
            for (index, &digit) in self.assigned[..position].iter().enumerate() {
                self.supports.bits[index] |= 1 << (digit - 1);
            }
            return;
        }

        let mut remaining = self.domains[position];
        while remaining != 0 {
            let candidate = (remaining.trailing_zeros() + 1) as u8;
            remaining &= remaining - 1;
            if !self.control.check() {
                self.exhausted = true;
                return;
            }
            self.assigned[position] = candidate;
            let next_sum =
                if position == 0 && matches!(self.constraint, RuleConstraint::Arrow { .. }) {
                    sum
                } else {
                    sum + u16::from(candidate)
                };
            if self.plausible(position, next_sum) {
                self.visit(position + 1, next_sum);
            }
            if self.exhausted {
                return;
            }
        }
    }
}

fn effective_domain(board: &Board, candidates: &[CandidateMask; BOARD_SIZE], cell: usize) -> u16 {
    if board.values()[cell] == 0 {
        candidates[cell].bits()
    } else {
        1 << (board.values()[cell] - 1)
    }
}

fn enumerate(
    board: &Board,
    candidates: &[CandidateMask; BOARD_SIZE],
    rules: &PreparedRules,
    constraint: &RuleConstraint,
    control: &mut ExecutionControl,
) -> SupportMasksResult {
    let cells = constraint.cells();
    let mut state = Enumerator {
        constraint,
        domains: [0; MAX_CONSTRAINT_CELLS],
        assigned: [0; MAX_CONSTRAINT_CELLS],
        supports: SupportMasks {
            bits: [0; MAX_CONSTRAINT_CELLS],
            len: cells.len(),
        },
        prefix_peers: [0; MAX_CONSTRAINT_CELLS],
        suffix_minimum: [0; MAX_CONSTRAINT_CELLS + 1],
        suffix_maximum: [0; MAX_CONSTRAINT_CELLS + 1],
        suffix_empty: [false; MAX_CONSTRAINT_CELLS + 1],
        exhausted: false,
        control,
    };
    for (position, &cell) in cells.iter().enumerate() {
        state.domains[position] = effective_domain(board, candidates, cell);
        for (previous, &peer) in cells[..position].iter().enumerate() {
            if rules.context().duplicate_peers[cell].contains(&peer) {
                state.prefix_peers[position] |= 1 << previous;
            }
        }
    }
    for position in (0..cells.len()).rev() {
        let domain = state.domains[position];
        state.suffix_empty[position] = domain == 0 || state.suffix_empty[position + 1];
        let minimum = if domain == 0 {
            0
        } else {
            domain.trailing_zeros() as u16 + 1
        };
        let maximum = if domain == 0 {
            0
        } else {
            u16::BITS as u16 - domain.leading_zeros() as u16
        };
        state.suffix_minimum[position] = minimum + state.suffix_minimum[position + 1];
        state.suffix_maximum[position] = maximum + state.suffix_maximum[position + 1];
    }
    // Visit order preserves the existing DFS support enumeration.
    state.visit(0, 0);

    if state.exhausted {
        Bounded::Cancelled
    } else {
        Bounded::Complete(state.supports)
    }
}

pub(crate) fn raw_for_constraint(
    board: &Board,
    candidates: &[CandidateMask; BOARD_SIZE],
    rules: &PreparedRules,
    constraint: &RuleConstraint,
    control: &mut ExecutionControl,
) -> SupportMasksResult {
    enumerate(board, candidates, rules, constraint, control)
}

/// The index names a constraint in this prepared layout; unknown indices are explicit input errors.
pub fn get_constraint_support(
    board: &Board,
    candidates: &[CandidateMask; BOARD_SIZE],
    rules: &PreparedRules,
    index: usize,
    control: &mut ExecutionControl,
) -> CoreResult<SupportResult> {
    let constraint = rules.context().constraints.get(index).ok_or_else(|| {
        EngineError::invalid("Constraint belongs to a different prepared context")
    })?;
    Ok(
        match raw_for_constraint(board, candidates, rules, constraint, control) {
            Bounded::Complete(masks) => Bounded::Complete(masks.into_snapshot(constraint.cells())),
            Bounded::Cancelled => Bounded::Cancelled,
        },
    )
}

/// Build complete static support; memory overflow selects exact enumeration.
pub fn prepare_constraint_support(
    rules: &PreparedRules,
    control: &mut ExecutionControl,
    limits: CatalogueLimits,
) -> CoreResult<Bounded<PreparedConstraintSupport>> {
    limits.validate()?;
    if !control.check() {
        return Ok(Bounded::Cancelled);
    }
    let mut catalogues = Vec::with_capacity(rules.context().constraints.len());
    let mut retained = 0;
    for constraint in &rules.context().constraints {
        let mut catalogue = None;
        if let RuleConstraint::Cage { cells, sum, .. } = constraint
            && cells.len() <= MAX_CATALOGUE_CELLS
        {
            let capacity = limits
                .max_tuples_per_constraint
                .min(limits.max_tuples_per_layout - retained);
            match cage_catalogue::compile(cells.len(), *sum, capacity, control) {
                CatalogueResult::Incomplete => return Ok(Bounded::Cancelled),
                CatalogueResult::Complete(complete) => {
                    retained += complete.tuples.len();
                    catalogue = Some(complete);
                }
                // Overflow drops every partial tuple before selecting exact enumeration.
                CatalogueResult::Fallback => {}
            }
        }
        catalogues.push(catalogue);
    }
    Ok(Bounded::Complete(PreparedConstraintSupport {
        layout: Arc::new(SupportLayout {
            rules: rules.clone(),
            catalogues,
        }),
    }))
}

impl PreparedConstraintSupport {
    pub fn get(
        &self,
        board: &Board,
        candidates: &[CandidateMask; BOARD_SIZE],
        index: usize,
        control: &mut ExecutionControl,
    ) -> CoreResult<SupportResult> {
        if index >= self.layout.rules.context().constraints.len() {
            return Err(EngineError::invalid(
                "Constraint belongs to a different prepared context",
            ));
        }
        Ok(match self.query_at(board, candidates, index, control) {
            Bounded::Complete(masks) => Bounded::Complete(
                masks.into_snapshot(self.layout.rules.context().constraints[index].cells()),
            ),
            Bounded::Cancelled => Bounded::Cancelled,
        })
    }

    // Only an index from this layout's own iteration reaches this internal operation.
    pub(crate) fn query_at(
        &self,
        board: &Board,
        candidates: &[CandidateMask; BOARD_SIZE],
        index: usize,
        control: &mut ExecutionControl,
    ) -> SupportMasksResult {
        let rules = &self.layout.rules;
        let constraint = &rules.context().constraints[index];
        let Some(catalogue) = &self.layout.catalogues[index] else {
            return enumerate(board, candidates, rules, constraint, control);
        };
        let cells = constraint.cells();
        let mut local_domains = [0; MAX_CONSTRAINT_CELLS];
        for (position, &cell) in cells.iter().enumerate() {
            local_domains[position] = effective_domain(board, candidates, cell);
        }
        let domains = &local_domains[..cells.len()];
        if !control.check() {
            return Bounded::Cancelled;
        }

        // A nearly fixed cage is cheaper to enumerate than to filter the complete catalogue.
        let combinations: usize = domains
            .iter()
            .map(|mask| mask.count_ones() as usize)
            .product();
        if combinations <= catalogue.tuples.len() {
            return enumerate(board, candidates, rules, constraint, control);
        }
        cage_catalogue::filter(cells.len(), domains, catalogue, control)
    }
}
