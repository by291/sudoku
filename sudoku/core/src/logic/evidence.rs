use super::types::{Evidence, LogicalWorkspace};
use crate::rules::types::{PuzzleRules, SudokuUnit, Unit};

pub(crate) fn unit_identity(unit: &SudokuUnit) -> Unit {
    Unit {
        kind: unit.kind,
        index: unit.index,
    }
}

pub(crate) fn unit_evidence(
    state: &LogicalWorkspace,
    unit: &SudokuUnit,
    cells: Vec<usize>,
    digits: Vec<u8>,
) -> Evidence {
    let units = if matches!(state.rules.rules(), PuzzleRules::Classic) {
        vec![]
    } else {
        state
            .rules
            .context()
            .units
            .iter()
            .filter(|candidate| cells.iter().any(|cell| candidate.cells.contains(cell)))
            .map(unit_identity)
            .collect()
    };
    Evidence::Unit {
        unit: unit_identity(unit),
        cells,
        digits,
        premises: state.premises.clone(),
        units: Some(units),
    }
}
