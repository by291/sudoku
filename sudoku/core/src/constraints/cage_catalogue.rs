use super::types::{
    CageCatalogue, CageTupleBlock, MAX_CATALOGUE_CELLS, MAX_CONSTRAINT_CELLS, SupportMasks,
    SupportMasksResult,
};
use crate::control::ExecutionControl;
use crate::types::{Bounded, UNIT_SIZE};

const TUPLES_PER_INDEX_BLOCK: usize = u64::BITS as usize;

pub(super) enum CatalogueResult {
    Complete(CageCatalogue),
    Fallback,
    Incomplete,
}

struct CatalogueBuilder<'a> {
    arity: usize,
    target: i32,
    capacity: usize,
    combination: [u8; MAX_CATALOGUE_CELLS],
    combination_len: usize,
    assigned: [u8; MAX_CATALOGUE_CELLS],
    assigned_len: usize,
    tuples: Vec<[u16; MAX_CATALOGUE_CELLS]>,
    exhausted: bool,
    overflow: bool,
    control: &'a mut ExecutionControl,
}

impl CatalogueBuilder<'_> {
    fn permute(&mut self, used: u16) {
        if self.assigned_len == self.combination_len {
            if self.tuples.len() >= self.capacity {
                self.overflow = true;
                return;
            }
            let mut tuple = [0; MAX_CATALOGUE_CELLS];
            for (index, &digit) in self.assigned[..self.assigned_len].iter().enumerate() {
                tuple[index] = 1 << (digit - 1);
            }
            self.tuples.push(tuple);
            return;
        }

        for index in 0..self.combination_len {
            let digit = self.combination[index];
            let bit = 1 << (digit - 1);
            if used & bit != 0 {
                continue;
            }
            if !self.control.check() {
                self.exhausted = true;
                return;
            }

            self.assigned[self.assigned_len] = digit;
            self.assigned_len += 1;
            self.permute(used | bit);
            self.assigned_len -= 1;
            if self.exhausted || self.overflow {
                return;
            }
        }
    }

    fn combine(&mut self, start: u8, sum: i32) {
        if self.combination_len == self.arity {
            if sum == self.target {
                self.permute(0);
            }
            return;
        }
        let remaining = (self.arity - self.combination_len) as i32;

        for digit in 1..=UNIT_SIZE as u8 {
            let value = i32::from(digit);
            if digit < start || value > UNIT_SIZE as i32 + 1 - remaining {
                continue;
            }
            if !self.control.check() {
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

            self.combination[self.combination_len] = digit;
            self.combination_len += 1;
            self.combine(digit + 1, sum + value);
            self.combination_len -= 1;
            if self.exhausted || self.overflow {
                return;
            }
        }
    }
}

pub(super) struct CatalogueRequest {
    pub arity: usize,
    pub target: u16,
    pub capacity: usize,
}

fn index_block(tuples: &[[u16; MAX_CATALOGUE_CELLS]], arity: usize) -> CageTupleBlock {
    let mut block = [[0; UNIT_SIZE]; MAX_CATALOGUE_CELLS];
    for (tuple_index, tuple) in tuples.iter().enumerate() {
        for position in 0..arity {
            let digit_index = tuple[position].trailing_zeros() as usize;
            block[position][digit_index] |= 1_u64 << tuple_index;
        }
    }

    block
}

/// Enumerate complete cage tuples and index them when the catalogue is large enough.
pub(super) fn compile(
    request: CatalogueRequest,
    control: &mut ExecutionControl,
) -> CatalogueResult {
    let CatalogueRequest {
        arity,
        target,
        capacity,
    } = request;

    let mut builder = CatalogueBuilder {
        arity,
        target: i32::from(target),
        capacity,
        combination: [0; MAX_CATALOGUE_CELLS],
        combination_len: 0,
        assigned: [0; MAX_CATALOGUE_CELLS],
        assigned_len: 0,
        tuples: vec![],
        exhausted: false,
        overflow: false,
        control,
    };
    builder.combine(1, 0);

    if builder.exhausted {
        return CatalogueResult::Incomplete;
    }
    if builder.overflow {
        return CatalogueResult::Fallback;
    }
    let mut index = Vec::new();

    // Tiny catalogues retain the direct scan; indexing them costs more than filtering them.
    if builder.tuples.len() >= TUPLES_PER_INDEX_BLOCK {
        for tuples in builder.tuples.chunks(TUPLES_PER_INDEX_BLOCK) {
            if !builder.control.check() {
                return CatalogueResult::Incomplete;
            }

            index.push(index_block(tuples, arity));
        }
    }

    CatalogueResult::Complete(CageCatalogue {
        arity,
        tuples: builder.tuples,
        index,
    })
}

/// Collect supported digits from the complete tuples compatible with the supplied domains.
pub(super) fn filter(
    domains: &[u16],
    catalogue: &CageCatalogue,
    control: &mut ExecutionControl,
) -> SupportMasksResult {
    let mut supports = SupportMasks {
        bits: [0; MAX_CONSTRAINT_CELLS],
        len: catalogue.arity,
    };

    if !catalogue.index.is_empty() {
        return filter_index(domains, catalogue, control);
    }

    for tuple in &catalogue.tuples {
        if !control.check() {
            return Bounded::Cancelled;
        }

        let mut is_compatible = true;
        for index in 0..catalogue.arity {
            if tuple[index] & domains[index] == 0 {
                is_compatible = false;
                break;
            }
        }

        if is_compatible {
            for (support, &bits) in supports.bits.iter_mut().zip(&tuple[..catalogue.arity]) {
                *support |= bits;
            }
        }
    }

    Bounded::Complete(supports)
}

fn compatible_tuples(block: &CageTupleBlock, domains: &[u16]) -> u64 {
    let mut compatible = u64::MAX;

    // Union the tuples allowed at each position, then intersect across all positions.
    for (position, &domain) in domains.iter().enumerate() {
        let mut permitted = 0;
        let mut remaining = domain;
        while remaining != 0 {
            let digit = remaining.trailing_zeros() as usize;
            remaining &= remaining - 1;
            permitted |= block[position][digit];
        }

        compatible &= permitted;
        if compatible == 0 {
            break;
        }
    }

    compatible
}

fn collect_indexed_support(
    supports: &mut SupportMasks,
    domains: &[u16],
    witness: (&CageTupleBlock, u64),
) {
    let (block, compatible) = witness;

    // Each surviving bit witnesses one complete assignment across every position.
    for (position, &domain) in domains.iter().enumerate() {
        let mut remaining = domain & !supports.bits[position];
        while remaining != 0 {
            let digit = remaining.trailing_zeros() as usize;
            let bit = 1 << digit;
            remaining &= remaining - 1;
            if block[position][digit] & compatible != 0 {
                supports.bits[position] |= bit;
            }
        }
    }
}

fn filter_index(
    domains: &[u16],
    catalogue: &CageCatalogue,
    control: &mut ExecutionControl,
) -> SupportMasksResult {
    let mut supports = SupportMasks {
        bits: [0; MAX_CONSTRAINT_CELLS],
        len: catalogue.arity,
    };

    for block in &catalogue.index {
        if !control.check() {
            return Bounded::Cancelled;
        }

        let compatible = compatible_tuples(block, domains);
        if compatible != 0 {
            collect_indexed_support(&mut supports, domains, (block, compatible));
        }
    }

    Bounded::Complete(supports)
}
