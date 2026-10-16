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

/// Scan validated rule groups without constructing memberships or pairwise topology.
/// Invalid geometry is rejected before givens, and only a completed board checks arithmetic totals.
pub(crate) fn directly_contradictory_rules(
    board: &crate::types::Board,
    rules: &PuzzleRules,
) -> CoreResult<bool> {
    validate_rules(rules)?;
    if matches!(rules, PuzzleRules::Classic) {
        let prepared = classic_prepared_rules()?;
        return Ok(prepared
            .context()
            .units
            .iter()
            .any(|unit| has_duplicate(board, &unit.cells)));
    }
    let compiled = definitions::compile(rules);
    if compiled
        .duplicate_groups
        .iter()
        .any(|cells| has_duplicate(board, cells))
    {
        return Ok(true);
    }
    Ok(!board.values().contains(&0)
        && compiled
            .constraints
            .iter()
            .any(|constraint| !satisfies_constraint(board, constraint)))
}

fn has_duplicate(board: &crate::types::Board, cells: &[usize]) -> bool {
    let mut seen = 0_u16;
    for &cell in cells {
        let digit = board.values()[cell];
        if digit == 0 {
            continue;
        }
        let bit = 1 << (digit - 1);
        if seen & bit != 0 {
            return true;
        }
        seen |= bit;
    }
    false
}

fn classic_prepared_rules() -> CoreResult<PreparedRules> {
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
