use crate::{BOARD_SIZE, Budget, Constraint, ConstraintKind, MAX_DIGIT, PreparedContext, mask_of};

// A discarded over-capacity catalogue falls back to domain enumeration, as in TypeScript.
pub(crate) fn compile_catalogue(cage: &Constraint, capacity: usize) -> Option<Vec<Vec<u16>>> {
    fn permute(
        combination: &[u8],
        assigned: &mut Vec<u16>,
        used: u16,
        capacity: usize,
        tuples: &mut Vec<Vec<u16>>,
    ) -> bool {
        if assigned.len() == combination.len() {
            if tuples.len() >= capacity {
                return false;
            }
            tuples.push(assigned.clone());
            return true;
        }

        for &digit in combination {
            let bit = mask_of(digit);
            if used & bit != 0 {
                continue;
            }
            assigned.push(bit);
            let complete = permute(combination, assigned, used | bit, capacity, tuples);
            assigned.pop();
            if !complete {
                return false;
            }
        }
        true
    }

    fn combine(
        cage: &Constraint,
        start: u8,
        sum: i32,
        combination: &mut Vec<u8>,
        capacity: usize,
        tuples: &mut Vec<Vec<u16>>,
    ) -> bool {
        if combination.len() == cage.cells.len() {
            return sum != i32::from(cage.sum)
                || permute(combination, &mut Vec::new(), 0, capacity, tuples);
        }

        let remaining = (cage.cells.len() - combination.len()) as i32;
        for digit in start..=MAX_DIGIT {
            if i32::from(digit) > i32::from(MAX_DIGIT) + 1 - remaining {
                continue;
            }
            let minimum = sum + remaining * i32::from(digit) + remaining * (remaining - 1) / 2;
            let maximum = sum + i32::from(digit) + (remaining - 1) * i32::from(MAX_DIGIT)
                - (remaining - 1) * (remaining - 2) / 2;
            if minimum > i32::from(cage.sum) || maximum < i32::from(cage.sum) {
                continue;
            }

            combination.push(digit);
            let complete = combine(
                cage,
                digit + 1,
                sum + i32::from(digit),
                combination,
                capacity,
                tuples,
            );
            combination.pop();
            if !complete {
                return false;
            }
        }
        true
    }

    let mut tuples = Vec::new();
    combine(cage, 1, 0, &mut Vec::new(), capacity, &mut tuples).then_some(tuples)
}

fn enumerate(
    domains: &[u16; BOARD_SIZE],
    context: &PreparedContext,
    constraint: &Constraint,
    budget: &mut Budget,
) -> Option<Vec<u16>> {
    struct Enumeration<'a> {
        choices: Vec<Vec<u8>>,
        assigned: Vec<u8>,
        supports: Vec<u16>,
        context: &'a PreparedContext,
        constraint: &'a Constraint,
    }

    impl Enumeration<'_> {
        fn plausible(&self) -> bool {
            let cells = &self.constraint.cells;
            for i in 0..self.assigned.len() {
                for j in 0..i {
                    if self.assigned[i] == self.assigned[j]
                        && self.context.topology.duplicate_peers[cells[i]].contains(&cells[j])
                    {
                        return false;
                    }
                }
            }

            if matches!(self.constraint.kind, ConstraintKind::Thermo) {
                let position = self.assigned.len() - 1;
                return (position == 0 || self.assigned[position] > self.assigned[position - 1])
                    && usize::from(self.assigned[position])
                        <= usize::from(MAX_DIGIT) - (cells.len() - self.assigned.len());
            }

            let arrow = matches!(self.constraint.kind, ConstraintKind::Arrow);
            let start = usize::from(arrow);
            let target = if arrow {
                u16::from(self.assigned[0])
            } else {
                self.constraint.sum
            };
            let mut minimum: u16 = self.assigned[start..]
                .iter()
                .map(|&digit| u16::from(digit))
                .sum();
            let mut maximum = minimum;
            for choices in &self.choices[start.max(self.assigned.len())..] {
                let (Some(first), Some(last)) = (choices.first(), choices.last()) else {
                    return false;
                };
                minimum += u16::from(*first);
                maximum += u16::from(*last);
            }
            minimum <= target && maximum >= target
        }

        fn visit(&mut self, position: usize, budget: &mut Budget) -> bool {
            if position == self.choices.len() {
                for (index, &digit) in self.assigned.iter().enumerate() {
                    self.supports[index] |= mask_of(digit);
                }
                return true;
            }

            for choice_index in 0..self.choices[position].len() {
                if !budget.charge() {
                    return false;
                }
                self.assigned.push(self.choices[position][choice_index]);
                let complete = !self.plausible() || self.visit(position + 1, budget);
                self.assigned.pop();
                if !complete {
                    return false;
                }
            }
            true
        }
    }

    let mut enumeration = Enumeration {
        choices: constraint
            .cells
            .iter()
            .map(|&cell| {
                (1..=MAX_DIGIT)
                    .filter(|&digit| domains[cell] & mask_of(digit) != 0)
                    .collect()
            })
            .collect(),
        assigned: Vec::new(),
        supports: vec![0; constraint.cells.len()],
        context,
        constraint,
    };
    enumeration.visit(0, budget).then_some(enumeration.supports)
}

pub(crate) fn get_support(
    domains: &[u16; BOARD_SIZE],
    context: &PreparedContext,
    index: usize,
    budget: &mut Budget,
) -> Option<Vec<u16>> {
    let constraint = &context.topology.constraints[index];
    let Some(tuples) = &context.catalogues[index] else {
        return enumerate(domains, context, constraint, budget);
    };
    if !budget.charge() {
        return None;
    }

    let combinations: u32 = constraint
        .cells
        .iter()
        .map(|&cell| domains[cell].count_ones())
        .product();
    if combinations <= tuples.len() as u32 {
        return enumerate(domains, context, constraint, budget);
    }

    let mut supports = vec![0; constraint.cells.len()];
    for tuple in tuples {
        let mut compatible = true;
        for (position, &cell) in constraint.cells.iter().enumerate() {
            if !budget.charge() {
                return None;
            }
            if tuple[position] & domains[cell] == 0 {
                compatible = false;
                break;
            }
        }
        if compatible {
            for (position, &mask) in tuple.iter().enumerate() {
                supports[position] |= mask;
            }
        }
    }
    Some(supports)
}
