use std::collections::BTreeSet;
use std::sync::OnceLock;

use super::definitions;
use super::types::{PreparedRules, PuzzleRules, RuleMetadata};
use crate::budget::{WorkBudget, WorkStage};
use crate::types::{BOARD_SIZE, Bounded, CoreResult, EngineError};

fn charge(budget: &mut Option<&mut WorkBudget>) -> bool {
    match budget {
        Some(budget) => budget.consume(1),
        None => true,
    }
}

fn memberships(
    groups: &[Vec<usize>],
    budget: &mut Option<&mut WorkBudget>,
) -> Option<Vec<Vec<usize>>> {
    let mut result = vec![vec![]; BOARD_SIZE];

    for (index, cells) in groups.iter().enumerate() {
        for &cell in cells {
            if !charge(budget) {
                return None;
            }
            result[cell].push(index);
        }
    }

    Some(result)
}

fn relationships(
    groups: &[Vec<usize>],
    budget: &mut Option<&mut WorkBudget>,
) -> Option<Vec<Vec<usize>>> {
    let mut result = vec![BTreeSet::new(); BOARD_SIZE];

    for cells in groups {
        for &cell in cells {
            for &peer in cells {
                // Self visits are charged too, matching the deterministic topology work model.
                if !charge(budget) {
                    return None;
                }
                if cell != peer {
                    result[cell].insert(peer);
                }
            }
        }
    }

    Some(
        result
            .into_iter()
            .map(|peers| peers.into_iter().collect())
            .collect(),
    )
}

fn build(rules: &PuzzleRules, mut budget: Option<&mut WorkBudget>) -> Option<PreparedRules> {
    if !charge(&mut budget) {
        return None;
    }

    let compiled = definitions::compile(rules);
    let units_as_cells: Vec<Vec<usize>> = compiled
        .units
        .iter()
        .map(|unit| unit.cells.clone())
        .collect();
    let constraints_as_cells: Vec<Vec<usize>> = compiled
        .constraints
        .iter()
        .map(|constraint| constraint.cells().to_vec())
        .collect();

    let cell_units = memberships(&units_as_cells, &mut budget)?;
    let cell_constraints = memberships(&constraints_as_cells, &mut budget)?;

    let duplicate_peers = relationships(&compiled.duplicate_groups, &mut budget)?;
    let mut related_groups = compiled.duplicate_groups;
    related_groups.extend(constraints_as_cells);
    let related_cells = relationships(&related_groups, &mut budget)?;

    Some(PreparedRules::new(RuleMetadata {
        rules: rules.clone(),
        units: compiled.units,
        constraints: compiled.constraints,
        cell_units,
        cell_constraints,
        duplicate_peers,
        related_cells,
    }))
}

/// Validate rule geometry without building or charging topology.
pub fn validate_rules(rules: &PuzzleRules) -> CoreResult<()> {
    definitions::validate(rules)
}

/// Validate and own an immutable layout. Native callers may choose this unbounded convenience API.
pub fn compile_rules(rules: &PuzzleRules) -> CoreResult<PreparedRules> {
    definitions::validate(rules)?;

    build(rules, None)
        .ok_or_else(|| EngineError::invalid("Unbounded rule compilation unexpectedly exhausted"))
}

/// Charged compilation returns no partial topology. Static Classic geometry is prepared for free.
pub fn prepare_rules(
    rules: &PuzzleRules,
    budget: &mut WorkBudget,
) -> CoreResult<Bounded<PreparedRules>> {
    definitions::validate(rules)?;
    if matches!(rules, PuzzleRules::Classic) {
        static CLASSIC: OnceLock<CoreResult<PreparedRules>> = OnceLock::new();
        return CLASSIC
            .get_or_init(|| compile_rules(&PuzzleRules::Classic))
            .clone()
            .map(Bounded::Complete);
    }

    Ok(budget.with_stage(WorkStage::Preparation, |budget| {
        match build(rules, Some(budget)) {
            Some(prepared) => Bounded::Complete(prepared),
            None => Bounded::BudgetExhausted,
        }
    }))
}

/// Called only with a validated constraint from an immutable prepared layout.
pub(crate) fn satisfies_constraint(
    board: &crate::types::Board,
    constraint: &super::types::RuleConstraint,
) -> bool {
    use super::types::RuleConstraint;
    let values = board.values();
    if constraint.cells().iter().any(|&cell| values[cell] == 0) {
        return false;
    }
    match constraint {
        RuleConstraint::Thermo { cells, .. } => {
            if !cells
                .windows(2)
                .all(|pair| values[pair[0]] < values[pair[1]])
            {
                return false;
            }
        }
        RuleConstraint::Arrow { cells, .. } => {
            let total: u16 = cells[1..].iter().map(|&cell| u16::from(values[cell])).sum();
            if total != u16::from(values[cells[0]]) {
                return false;
            }
        }
        RuleConstraint::Cage { cells, sum, .. } => {
            let mut seen = 0_u16;
            let mut total = 0_u16;
            for &cell in cells {
                let bit = 1 << (values[cell] - 1);
                if seen & bit != 0 {
                    return false;
                }
                seen |= bit;
                total += u16::from(values[cell]);
            }
            if total != *sum {
                return false;
            }
        }
    }
    true
}
