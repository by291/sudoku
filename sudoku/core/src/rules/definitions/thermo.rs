use super::super::{
    topology::{classic_units, ordered_path, valid_cells},
    types::{CompiledVariantRules, RuleConstraint},
};
use crate::types::{CoreResult, EngineError, UNIT_SIZE};

/// Validate thermometer paths in bulb-to-tip order.
pub(super) fn validate(paths: &[Vec<usize>]) -> CoreResult<()> {
    if paths.is_empty() {
        return Err(EngineError::invalid("Thermo requires paths"));
    }

    for path in paths {
        if !valid_cells(path, 2, UNIT_SIZE) || !ordered_path(path) {
            return Err(EngineError::invalid(
                "Thermo requires adjacent, distinct ordered cells",
            ));
        }
    }

    Ok(())
}

/// Add increasing thermometer paths to the Classic full units.
pub(super) fn compile(paths: &[Vec<usize>]) -> CompiledVariantRules {
    let units = classic_units();
    let indexed_paths = paths.iter().enumerate();
    let constraints = indexed_paths
        .map(|(index, cells)| RuleConstraint::Thermo {
            id: format!("thermo:{index}"),
            index,
            cells: cells.clone(),
        })
        .collect();

    let duplicate_groups = units.iter().map(|unit| unit.cells.clone()).collect();

    CompiledVariantRules {
        units,
        constraints,
        duplicate_groups,
    }
}
