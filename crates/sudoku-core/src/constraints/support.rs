use std::sync::Arc;

use super::cage_catalogue::{self, CatalogueResult};
use super::types::{
    CatalogueLimits, MAX_CATALOGUE_CELLS, PreparedConstraintSupport, SupportLayout, SupportResult,
    SupportSnapshot,
};
use crate::budget::{WorkBudget, WorkStage};
use crate::rules::types::{PreparedRules, RuleConstraint};
use crate::types::{BOARD_SIZE, Board, Bounded, CandidateMask, CoreResult, EngineError, UNIT_SIZE};

struct Enumerator<'a> {
    rules: &'a PreparedRules,
    constraint: &'a RuleConstraint,
    domains: Vec<Vec<u8>>,
    assigned: Vec<u8>,
    supports: Vec<u16>,
    exhausted: bool,
    budget: &'a mut WorkBudget,
}

impl Enumerator<'_> {
    fn plausible(&self) -> bool {
        let cells = self.constraint.cells();
        for first in 0..self.assigned.len() {
            for second in 0..first {
                if self.assigned[first] == self.assigned[second]
                    && self.rules.context().duplicate_peers[cells[first]].contains(&cells[second])
                {
                    return false;
                }
            }
        }
        let (start, target) = match self.constraint {
            RuleConstraint::Thermo { .. } => {
                let position = self.assigned.len() - 1;
                let digit = self.assigned[position];
                return (position == 0 || digit > self.assigned[position - 1])
                    && usize::from(digit) <= UNIT_SIZE - (cells.len() - self.assigned.len());
            }
            RuleConstraint::Arrow { .. } => (1, u16::from(self.assigned[0])),
            RuleConstraint::Cage { sum, .. } => (0, *sum),
        };
        let mut minimum: u16 = self
            .assigned
            .iter()
            .skip(start)
            .map(|&digit| u16::from(digit))
            .sum();
        let mut maximum = minimum;
        for index in start.max(self.assigned.len())..self.domains.len() {
            let domain = &self.domains[index];
            let (Some(&first), Some(&last)) = (domain.first(), domain.last()) else {
                return false;
            };
            minimum += u16::from(first);
            maximum += u16::from(last);
        }
        minimum <= target && maximum >= target
    }

    fn visit(&mut self, position: usize) {
        if self.exhausted {
            return;
        }
        if position == self.domains.len() {
            for (index, &digit) in self.assigned.iter().enumerate() {
                self.supports[index] |= 1 << (digit - 1);
            }
            return;
        }

        for index in 0..self.domains[position].len() {
            let candidate = self.domains[position][index];
            if !self.budget.consume(1) {
                self.exhausted = true;
                return;
            }
            self.assigned.push(candidate);
            if self.plausible() {
                self.visit(position + 1);
            }
            self.assigned.pop();
            if self.exhausted {
                return;
            }
        }
    }
}

fn enumerate(
    board: &Board,
    candidates: &[CandidateMask; BOARD_SIZE],
    rules: &PreparedRules,
    constraint: &RuleConstraint,
    budget: &mut WorkBudget,
) -> SupportResult {
    let cells = constraint.cells();
    let domains = cells
        .iter()
        .map(|&cell| {
            let value = board.values()[cell];
            if value == 0 {
                (1..=UNIT_SIZE as u8)
                    .filter(|digit| candidates[cell].bits() & (1 << (digit - 1)) != 0)
                    .collect()
            } else {
                vec![value]
            }
        })
        .collect();
    let mut state = Enumerator {
        rules,
        constraint,
        domains,
        assigned: vec![],
        supports: vec![0; cells.len()],
        exhausted: false,
        budget,
    };
    state.visit(0);

    if state.exhausted {
        return Bounded::BudgetExhausted;
    }

    Bounded::Complete(SupportSnapshot {
        cells: cells.to_vec(),
        supports: state
            .supports
            .into_iter()
            .map(CandidateMask::from_computed_bits)
            .collect(),
    })
}

pub(crate) fn raw_for_constraint(
    board: &Board,
    candidates: &[CandidateMask; BOARD_SIZE],
    rules: &PreparedRules,
    constraint: &RuleConstraint,
    budget: &mut WorkBudget,
) -> SupportResult {
    budget.with_stage(WorkStage::Arithmetic, |budget| {
        enumerate(board, candidates, rules, constraint, budget)
    })
}

/// The index names a constraint in this prepared layout; unknown indices are explicit input errors.
pub fn get_constraint_support(
    board: &Board,
    candidates: &[CandidateMask; BOARD_SIZE],
    rules: &PreparedRules,
    index: usize,
    budget: &mut WorkBudget,
) -> CoreResult<SupportResult> {
    let constraint = rules.context().constraints.get(index).ok_or_else(|| {
        EngineError::invalid("Constraint belongs to a different prepared context")
    })?;
    Ok(raw_for_constraint(
        board, candidates, rules, constraint, budget,
    ))
}

/// Build only complete static support; overflow selects exact enumeration without refund.
pub fn prepare_constraint_support(
    rules: &PreparedRules,
    budget: &mut WorkBudget,
    limits: CatalogueLimits,
) -> CoreResult<Bounded<PreparedConstraintSupport>> {
    limits.validate()?;
    Ok(budget.with_stage(WorkStage::Arithmetic, |budget| {
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
                match cage_catalogue::compile(cells.len(), *sum, capacity, budget) {
                    CatalogueResult::BudgetExhausted => return Bounded::BudgetExhausted,
                    CatalogueResult::Complete(complete) => {
                        retained += complete.tuples.len();
                        catalogue = Some(complete);
                    }
                    // Overflow drops every partial tuple and retains the already spent work.
                    CatalogueResult::Fallback => {}
                }
            }
            catalogues.push(catalogue);
        }
        Bounded::Complete(PreparedConstraintSupport {
            layout: Arc::new(SupportLayout {
                rules: rules.clone(),
                catalogues,
            }),
        })
    }))
}

impl PreparedConstraintSupport {
    pub fn get(
        &self,
        board: &Board,
        candidates: &[CandidateMask; BOARD_SIZE],
        index: usize,
        budget: &mut WorkBudget,
    ) -> CoreResult<SupportResult> {
        if index >= self.layout.rules.context().constraints.len() {
            return Err(EngineError::invalid(
                "Constraint belongs to a different prepared context",
            ));
        }
        Ok(self.query_at(board, candidates, index, budget))
    }

    // Only an index from this layout's own iteration reaches this internal operation.
    pub(crate) fn query_at(
        &self,
        board: &Board,
        candidates: &[CandidateMask; BOARD_SIZE],
        index: usize,
        budget: &mut WorkBudget,
    ) -> SupportResult {
        budget.with_stage(WorkStage::Arithmetic, |budget| {
            let rules = &self.layout.rules;
            let constraint = &rules.context().constraints[index];
            let Some(catalogue) = &self.layout.catalogues[index] else {
                return enumerate(board, candidates, rules, constraint, budget);
            };
            let cells = constraint.cells();
            let domains: Vec<u16> = cells
                .iter()
                .map(|&cell| {
                    if board.values()[cell] == 0 {
                        candidates[cell].bits()
                    } else {
                        1 << (board.values()[cell] - 1)
                    }
                })
                .collect();
            if !budget.consume(1) {
                return Bounded::BudgetExhausted;
            }

            // A nearly fixed cage is cheaper to enumerate; static preparation is never refunded.
            let combinations: usize = domains
                .iter()
                .map(|mask| mask.count_ones() as usize)
                .product();
            if combinations <= catalogue.tuples.len() {
                return enumerate(board, candidates, rules, constraint, budget);
            }
            cage_catalogue::filter(cells, &domains, catalogue, budget)
        })
    }
}
