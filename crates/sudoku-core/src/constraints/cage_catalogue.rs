use super::types::{CageCatalogue, MAX_CATALOGUE_CELLS, SupportResult, SupportSnapshot};
use crate::budget::WorkBudget;
use crate::types::{Bounded, CandidateMask, UNIT_SIZE};

pub(super) enum CatalogueResult {
    Complete(CageCatalogue),
    Fallback,
    BudgetExhausted,
}

struct CatalogueBuilder<'a> {
    arity: usize,
    target: i32,
    capacity: usize,
    combination: Vec<u8>,
    assigned: Vec<u8>,
    tuples: Vec<[u16; MAX_CATALOGUE_CELLS]>,
    exhausted: bool,
    overflow: bool,
    budget: &'a mut WorkBudget,
}

impl CatalogueBuilder<'_> {
    fn permute(&mut self, used: u16) {
        if self.assigned.len() == self.combination.len() {
            if self.tuples.len() >= self.capacity {
                self.overflow = true;
                return;
            }
            let mut tuple = [0; MAX_CATALOGUE_CELLS];
            for (index, &digit) in self.assigned.iter().enumerate() {
                tuple[index] = 1 << (digit - 1);
            }
            self.tuples.push(tuple);
            return;
        }

        for index in 0..self.combination.len() {
            let digit = self.combination[index];
            let bit = 1 << (digit - 1);
            if used & bit != 0 {
                continue;
            }
            if !self.budget.consume(1) {
                self.exhausted = true;
                return;
            }

            self.assigned.push(digit);
            self.permute(used | bit);
            self.assigned.pop();
            if self.exhausted || self.overflow {
                return;
            }
        }
    }

    fn combine(&mut self, start: u8, sum: i32) {
        if self.combination.len() == self.arity {
            if sum == self.target {
                self.permute(0);
            }
            return;
        }
        let remaining = (self.arity - self.combination.len()) as i32;

        for digit in 1..=UNIT_SIZE as u8 {
            let value = i32::from(digit);
            if digit < start || value > UNIT_SIZE as i32 + 1 - remaining {
                continue;
            }
            if !self.budget.consume(1) {
                self.exhausted = true;
                return;
            }

            // Signed arithmetic keeps (remaining-2) valid when only one digit remains.
            let minimum = sum + remaining * value + remaining * (remaining - 1) / 2;
            let maximum = sum + value + (remaining - 1) * UNIT_SIZE as i32
                - (remaining - 1) * (remaining - 2) / 2;
            if minimum > self.target || maximum < self.target {
                continue;
            }

            self.combination.push(digit);
            self.combine(digit + 1, sum + value);
            self.combination.pop();
            if self.exhausted || self.overflow {
                return;
            }
        }
    }
}

pub(super) fn compile(
    arity: usize,
    target: u16,
    capacity: usize,
    budget: &mut WorkBudget,
) -> CatalogueResult {
    let mut builder = CatalogueBuilder {
        arity,
        target: i32::from(target),
        capacity,
        combination: vec![],
        assigned: vec![],
        tuples: vec![],
        exhausted: false,
        overflow: false,
        budget,
    };
    builder.combine(1, 0);

    if builder.exhausted {
        return CatalogueResult::BudgetExhausted;
    }
    if builder.overflow {
        return CatalogueResult::Fallback;
    }
    CatalogueResult::Complete(CageCatalogue {
        arity,
        tuples: builder.tuples,
    })
}

pub(super) fn filter(
    cells: &[usize],
    domains: &[u16],
    catalogue: &CageCatalogue,
    budget: &mut WorkBudget,
) -> SupportResult {
    let mut supports = vec![0_u16; cells.len()];
    for tuple in &catalogue.tuples {
        let mut compatible = true;
        for index in 0..catalogue.arity {
            if !budget.consume(1) {
                return Bounded::BudgetExhausted;
            }
            if tuple[index] & domains[index] == 0 {
                compatible = false;
                break;
            }
        }
        if compatible {
            for index in 0..catalogue.arity {
                supports[index] |= tuple[index];
            }
        }
    }

    Bounded::Complete(SupportSnapshot {
        cells: cells.to_vec(),
        supports: supports
            .into_iter()
            .map(CandidateMask::from_computed_bits)
            .collect(),
    })
}
