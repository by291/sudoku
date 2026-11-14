use super::super::{
    topology::{classic_units, ordered_path, valid_cells},
    types::{Arrow, CompiledVariantRules, RuleConstraint},
};
use crate::types::{BOARD_SIZE, CoreResult, EngineError, UNIT_SIZE};

fn ordered_cells(arrow: &Arrow) -> Vec<usize> {
    std::iter::once(arrow.circle)
        .chain(arrow.shaft.iter().copied())
        .collect()
}

/// Validate each circle and its ordered, non-repeating shaft.
pub(super) fn validate(arrows: &[Arrow]) -> CoreResult<()> {
    if arrows.is_empty() {
        return Err(EngineError::invalid("Arrow requires clues"));
    }

    for arrow in arrows {
        if arrow.circle >= BOARD_SIZE {
            return Err(EngineError::invalid("Invalid arrow circle"));
        }

        if !valid_cells(&arrow.shaft, 1, UNIT_SIZE) || arrow.shaft.contains(&arrow.circle) {
            return Err(EngineError::invalid(
                "Arrow requires adjacent, distinct shaft cells outside its circle",
            ));
        }

        let cells = ordered_cells(arrow);
        if !ordered_path(&cells) {
            return Err(EngineError::invalid(
                "Arrow requires adjacent, distinct shaft cells outside its circle",
            ));
        }
    }

    Ok(())
}

/// Add validated sum relations to the Classic full units.
pub(super) fn compile(arrows: &[Arrow]) -> CompiledVariantRules {
    let units = classic_units();
    let indexed_arrows = arrows.iter().enumerate();
    let constraints = indexed_arrows
        .map(|(index, arrow)| RuleConstraint::Arrow {
            id: format!("arrow:{index}"),
            index,
            cells: ordered_cells(arrow),
        })
        .collect();

    // Arrow relation alone does not forbid a repeated digit on different shaft cells.
    let duplicate_groups = units.iter().map(|unit| unit.cells.clone()).collect();

    CompiledVariantRules {
        units,
        constraints,
        duplicate_groups,
    }
}
