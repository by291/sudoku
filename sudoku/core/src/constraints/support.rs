use std::sync::Arc;

use super::cage_catalogue::{self, CatalogueRequest, CatalogueResult};
use super::types::{
    CatalogueLimits, MAX_CATALOGUE_CELLS, MAX_CONSTRAINT_CELLS, PreparedConstraintSupport,
    SupportLayout, SupportMasks, SupportMasksResult, SupportResult,
};
use crate::control::ExecutionControl;
use crate::rules::types::{PreparedRules, RuleConstraint};
use crate::types::{BOARD_SIZE, Board, Bounded, CandidateMask, CoreResult, EngineError, UNIT_SIZE};

#[derive(Clone, Copy)]
pub(crate) struct SupportBoard<'board> {
    pub board: &'board Board,
    pub candidates: &'board [CandidateMask; BOARD_SIZE],
}

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
        // Earlier pairs already passed this test. An arrow may repeat digits at non-peer cells.
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
            // The arrow circle sets the target. Only shaft digits contribute to the sum.
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

impl SupportBoard<'_> {
    fn domain(self, cell: usize) -> u16 {
        let value = self.board.values()[cell];
        if value == 0 {
            self.candidates[cell].bits()
        } else {
            1 << (value - 1)
        }
    }
}

// Strictly increasing paths have no repeat choices. The earliest prefix and latest suffix
// are sufficient witnesses for each retained digit, including domains with gaps.
fn thermo_support(
    board: SupportBoard<'_>,
    cells: &[usize],
    control: &mut ExecutionControl,
) -> SupportMasksResult {
    let mut result = SupportMasks {
        bits: [0; MAX_CONSTRAINT_CELLS],
        len: cells.len(),
    };
    let mut domains = [0_u16; MAX_CONSTRAINT_CELLS];
    let mut earliest = [0_u32; MAX_CONSTRAINT_CELLS];
    let mut previous = 0;

    for (position, &cell) in cells.iter().enumerate() {
        if !control.check() {
            return Bounded::Cancelled;
        }
        domains[position] = board.domain(cell);
        let available = domains[position] & (crate::types::ALL_DIGITS_MASK << previous);
        if available == 0 {
            return Bounded::Complete(result);
        }
        previous = available.trailing_zeros() + 1;
        earliest[position] = previous;
    }

    let mut next = UNIT_SIZE as u32 + 1;
    for position in (0..cells.len()).rev() {
        if !control.check() {
            return Bounded::Cancelled;
        }
        let available = domains[position] & ((1 << (next - 1)) - 1);
        if available == 0 {
            result.bits.fill(0);
            return Bounded::Complete(result);
        }
        next = u16::BITS - available.leading_zeros();
        let below_minimum = (1 << (earliest[position] - 1)) - 1;
        result.bits[position] = available & !below_minimum;
    }

    Bounded::Complete(result)
}

pub(crate) struct RawSupportQuery<'layout> {
    pub board: SupportBoard<'layout>,
    pub rules: &'layout PreparedRules,
    pub constraint: &'layout RuleConstraint,
}

/// Compute local support directly from one checked constraint and its current domains.
pub(crate) fn raw_for_constraint(
    query: RawSupportQuery<'_>,
    control: &mut ExecutionControl,
) -> SupportMasksResult {
    let RawSupportQuery {
        board,
        rules,
        constraint,
    } = query;

    let cells = constraint.cells();
    if matches!(constraint, RuleConstraint::Thermo { .. }) {
        return thermo_support(board, cells, control);
    }

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
        state.domains[position] = board.domain(cell);
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

    // Ascending candidate bits preserve deterministic depth-first cancellation checkpoints.
    state.visit(0, 0);

    if state.exhausted {
        Bounded::Cancelled
    } else {
        Bounded::Complete(state.supports)
    }
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
    let query = RawSupportQuery {
        board: SupportBoard { board, candidates },
        rules,
        constraint,
    };

    Ok(match raw_for_constraint(query, control) {
        Bounded::Complete(masks) => Bounded::Complete(masks.into_snapshot(constraint.cells())),
        Bounded::Cancelled => Bounded::Cancelled,
    })
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
            let request = CatalogueRequest {
                arity: cells.len(),
                target: *sum,
                capacity,
            };

            match cage_catalogue::compile(request, control) {
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
    /// Return an owned local support snapshot for an index in this prepared layout.
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

        Ok(
            match self.query_at(SupportBoard { board, candidates }, index, control) {
                Bounded::Complete(masks) => Bounded::Complete(
                    masks.into_snapshot(self.layout.rules.context().constraints[index].cells()),
                ),
                Bounded::Cancelled => Bounded::Cancelled,
            },
        )
    }

    // Only an index from this layout's own iteration reaches this internal operation.
    pub(crate) fn query_at(
        &self,
        board: SupportBoard<'_>,
        index: usize,
        control: &mut ExecutionControl,
    ) -> SupportMasksResult {
        let rules = &self.layout.rules;
        let constraint = &rules.context().constraints[index];
        let query = RawSupportQuery {
            board,
            rules,
            constraint,
        };
        let Some(catalogue) = &self.layout.catalogues[index] else {
            return raw_for_constraint(query, control);
        };

        let cells = constraint.cells();
        let mut local_domains = [0; MAX_CONSTRAINT_CELLS];
        for (position, &cell) in cells.iter().enumerate() {
            local_domains[position] = board.domain(cell);
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
            return raw_for_constraint(query, control);
        }
        cage_catalogue::filter(domains, catalogue, control)
    }
}
