use super::super::{
    topology::{classic_units, compile_units, connected, partition, valid_cells},
    types::{CompiledVariantRules, SudokuUnit, UnitKind},
};
use crate::types::{CoreResult, EngineError, UNIT_SIZE};

pub(super) fn validate(regions: &[Vec<usize>]) -> CoreResult<()> {
    if regions.len() != UNIT_SIZE {
        return Err(EngineError::invalid("Jigsaw requires nine regions"));
    }

    for region in regions {
        if !valid_cells(region, UNIT_SIZE, UNIT_SIZE) || !connected(region) {
            return Err(EngineError::invalid(
                "Jigsaw regions must contain nine connected cells",
            ));
        }
    }

    if !partition(regions.iter().map(Vec::as_slice)) {
        return Err(EngineError::invalid(
            "Jigsaw regions must partition all cells",
        ));
    }

    Ok(())
}

pub(super) fn compile(regions: &[Vec<usize>]) -> CompiledVariantRules {
    let mut units = classic_units();
    units.truncate(UNIT_SIZE * 2);
    units.extend(regions.iter().enumerate().map(|(index, cells)| SudokuUnit {
        kind: UnitKind::Region,
        index,
        cells: cells.clone(),
    }));
    compile_units(units)
}
