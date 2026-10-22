use std::sync::OnceLock;

use super::definitions;
use super::types::{PreparedRules, PuzzleRules, RuleMetadata};
use crate::control::ExecutionControl;
use crate::types::{BOARD_SIZE, Bounded, CoreResult, EngineError};

fn checkpoint(control: &mut Option<&mut ExecutionControl>) -> bool {
    match control {
        Some(control) => control.check(),
        None => true,
    }
}

fn memberships<'a>(
    groups: impl IntoIterator<Item = &'a [usize]>,
    control: &mut Option<&mut ExecutionControl>,
) -> Option<Vec<Vec<usize>>> {
    let mut result = vec![vec![]; BOARD_SIZE];

    for (index, cells) in groups.into_iter().enumerate() {
        if !checkpoint(control) {
            return None;
        }
        for &cell in cells {
            result[cell].push(index);
        }
    }

    Some(result)
}

fn relationships<'a>(
    groups: impl IntoIterator<Item = &'a [usize]>,
    control: &mut Option<&mut ExecutionControl>,
) -> Option<Vec<Vec<usize>>> {
    // Two machine words cover the finite board without tree nodes or target-dependent u128 shifts.
    let mut result = [[0_u64; 2]; BOARD_SIZE];

    for cells in groups {
        if !checkpoint(control) {
            return None;
        }
        for &cell in cells {
            for &peer in cells {
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

fn build(rules: &PuzzleRules, mut control: Option<&mut ExecutionControl>) -> Option<PreparedRules> {
    if !checkpoint(&mut control) {
        return None;
    }

    let compiled = definitions::compile(rules);
    let cell_units = memberships(
        compiled.units.iter().map(|unit| unit.cells.as_slice()),
        &mut control,
    )?;
    let cell_constraints = memberships(
        compiled
            .constraints
            .iter()
            .map(|constraint| constraint.cells()),
        &mut control,
    )?;

    let duplicate_peers = relationships(
        compiled.duplicate_groups.iter().map(Vec::as_slice),
        &mut control,
    )?;
    let related_cells = relationships(
        compiled.duplicate_groups.iter().map(Vec::as_slice).chain(
            compiled
                .constraints
                .iter()
                .map(|constraint| constraint.cells()),
        ),
        &mut control,
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

/// Validate rule geometry without building topology.
pub fn validate_rules(rules: &PuzzleRules) -> CoreResult<()> {
    definitions::validate(rules)
}

/// Reuse static Classic topology across board validation and preparation.
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

/// Cancellable compilation returns no partial topology. Classic geometry is shared.
pub fn prepare_rules(
    rules: &PuzzleRules,
    control: &mut ExecutionControl,
) -> CoreResult<Bounded<PreparedRules>> {
    definitions::validate(rules)?;
    if !control.check() {
        return Ok(Bounded::Cancelled);
    }

    if matches!(rules, PuzzleRules::Classic) {
        return classic_prepared_rules().map(Bounded::Complete);
    }

    Ok(match build(rules, Some(control)) {
        Some(prepared) => Bounded::Complete(prepared),
        None => Bounded::Cancelled,
    })
}
