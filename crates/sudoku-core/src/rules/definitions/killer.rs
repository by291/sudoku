use super::super::{
    topology::{classic_units, connected, partition, valid_cells},
    types::{Cage, CompiledVariantRules, RuleConstraint},
};
use crate::types::{CoreResult, EngineError, UNIT_SIZE};

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
        let count = cage.cells.len();
        if usize::from(cage.sum) < count * (count + 1) / 2
            || usize::from(cage.sum) > count * (19 - count) / 2
        {
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

pub(super) fn compile(cages: &[Cage]) -> CompiledVariantRules {
    let units = classic_units();
    let constraints = cages
        .iter()
        .enumerate()
        .map(|(index, cage)| RuleConstraint::Cage {
            id: format!("cage:{index}"),
            index,
            cells: cage.cells.clone(),
            sum: cage.sum,
        })
        .collect();
    // Cages exclude duplicates without becoming complete nine-digit units.
    let duplicate_groups = units
        .iter()
        .map(|unit| unit.cells.clone())
        .chain(cages.iter().map(|cage| cage.cells.clone()))
        .collect();

    CompiledVariantRules {
        units,
        constraints,
        duplicate_groups,
    }
}
