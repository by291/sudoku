use super::super::{
    topology::{classic_units, compile_units},
    types::{CompiledVariantRules, SudokuUnit, UnitKind},
};
use crate::types::UNIT_SIZE;

/// Append both diagonals as full units after the Classic units.
pub(super) fn compile() -> CompiledVariantRules {
    let mut units = classic_units();

    units.push(SudokuUnit {
        kind: UnitKind::Diagonal,
        index: 0,
        cells: (0..UNIT_SIZE)
            .map(|index| index * (UNIT_SIZE + 1))
            .collect(),
    });
    units.push(SudokuUnit {
        kind: UnitKind::Diagonal,
        index: 1,
        cells: (0..UNIT_SIZE)
            .map(|index| (index + 1) * (UNIT_SIZE - 1))
            .collect(),
    });

    compile_units(units)
}
