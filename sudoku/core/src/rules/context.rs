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

fn memberships<'a>(
    groups: impl IntoIterator<Item = &'a [usize]>,
    budget: &mut Option<&mut WorkBudget>,
) -> Option<Vec<Vec<usize>>> {
    let mut result = vec![vec![]; BOARD_SIZE];

    for (index, cells) in groups.into_iter().enumerate() {
        for &cell in cells {
            if !charge(budget) {
                return None;
            }

            result[cell].push(index);
        }
    }

    Some(result)
}

fn relationships<'a>(
    groups: impl IntoIterator<Item = &'a [usize]>,
    budget: &mut Option<&mut WorkBudget>,
) -> Option<Vec<Vec<usize>>> {
    // Two machine words cover the finite board without tree nodes or target-dependent u128 shifts.
    let mut result = [[0_u64; 2]; BOARD_SIZE];

    for cells in groups {
        for &cell in cells {
            for &peer in cells {
                // Self visits are charged too, matching the deterministic topology work model.
                if !charge(budget) {
                    return None;
                }

                if cell != peer {
                    result[cell][peer / 64] |= 1_u64 << (peer % 64);
                }
            }
        }
    }

    Some(
        result
            .into_iter()
            .map(|peers| {
                (0..BOARD_SIZE)
                    .filter(|&cell| peers[cell / 64] & (1_u64 << (cell % 64)) != 0)
                    .collect()
            })
            .collect(),
    )
}

fn build(rules: &PuzzleRules, mut budget: Option<&mut WorkBudget>) -> Option<PreparedRules> {
    if !charge(&mut budget) {
        return None;
    }

    let compiled = definitions::compile(rules);
    let cell_units = memberships(
        compiled.units.iter().map(|unit| unit.cells.as_slice()),
        &mut budget,
    )?;
    let cell_constraints = memberships(
        compiled
            .constraints
            .iter()
            .map(|constraint| constraint.cells()),
        &mut budget,
    )?;

    let duplicate_peers = relationships(
        compiled.duplicate_groups.iter().map(Vec::as_slice),
        &mut budget,
    )?;
    let related_cells = relationships(
        compiled.duplicate_groups.iter().map(Vec::as_slice).chain(
            compiled
                .constraints
                .iter()
                .map(|constraint| constraint.cells()),
        ),
        &mut budget,
    )?;

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

/// Reuse static Classic topology without charging per-board validation or preparation.
pub(super) fn classic_prepared_rules() -> CoreResult<PreparedRules> {
    static CLASSIC: OnceLock<CoreResult<PreparedRules>> = OnceLock::new();

    CLASSIC
        .get_or_init(|| compile_rules(&PuzzleRules::Classic))
        .clone()
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
        return classic_prepared_rules().map(Bounded::Complete);
    }

    Ok(budget.with_stage(WorkStage::Preparation, |budget| {
        match build(rules, Some(budget)) {
            Some(prepared) => Bounded::Complete(prepared),
            None => Bounded::BudgetExhausted,
        }
    }))
}
