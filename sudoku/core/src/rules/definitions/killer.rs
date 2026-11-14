use super::super::{
    topology::{classic_units, connected, partition, valid_cells},
    types::{Cage, CompiledVariantRules, RuleConstraint},
};
use crate::types::{CoreResult, EngineError, UNIT_SIZE};

/// Validate connected cage coverage and each total's distinct-digit bounds.
pub(super) fn validate(cages: &[Cage]) -> CoreResult<()> {
    if cages.is_empty() {
        return Err(EngineError::invalid("Killer requires cages"));
    }

    for cage in cages {
        if !valid_cells(&cage.cells, 1, UNIT_SIZE) || !connected(&cage.cells) {
            return Err(EngineError::invalid(
                "Cages must contain connected distinct cells",
            ));
        }

        // The smallest and largest sums use the lowest and highest distinct digits.
        let count = cage.cells.len();
        let minimum = count * (count + 1) / 2;
        let maximum = count * (2 * UNIT_SIZE + 1 - count) / 2;
        let sum = usize::from(cage.sum);
        if sum < minimum || sum > maximum {
            return Err(EngineError::invalid(
                "Cage total is outside distinct digit bounds",
            ));
        }
    }

    if !partition(cages.iter().map(|cage| cage.cells.as_slice())) {
        return Err(EngineError::invalid("Cages must partition all cells"));
    }

    Ok(())
}

/// Add cage sums and duplicate exclusions to the Classic full units.
pub(super) fn compile(cages: &[Cage]) -> CompiledVariantRules {
    let units = classic_units();
    let indexed_cages = cages.iter().enumerate();
    let constraints = indexed_cages
        .map(|(index, cage)| RuleConstraint::Cage {
            id: format!("cage:{index}"),
            index,
            cells: cage.cells.clone(),
            sum: cage.sum,
        })
        .collect();

    // Cages exclude duplicates without becoming complete nine-digit units.
    let unit_cells = units.iter().map(|unit| unit.cells.clone());
    let cage_cells = cages.iter().map(|cage| cage.cells.clone());
    let duplicate_groups = unit_cells.chain(cage_cells).collect();

    CompiledVariantRules {
        units,
        constraints,
        duplicate_groups,
    }
}
