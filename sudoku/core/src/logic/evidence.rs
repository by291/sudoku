use super::types::{Evidence, LogicalWorkspace};
use crate::rules::types::{PuzzleRules, SudokuUnit, Unit};

pub(crate) fn unit_identity(unit: &SudokuUnit) -> Unit {
    Unit {
        kind: unit.kind,
        index: unit.index,
    }
}

pub(crate) struct UnitWitness<'a> {
    pub state: &'a LogicalWorkspace,
    pub unit: &'a SudokuUnit,
    pub cells: Vec<usize>,
    pub digits: Vec<u8>,
}

pub(crate) fn unit_evidence(witness: UnitWitness<'_>) -> Evidence {
    let UnitWitness {
        state,
        unit,
        cells,
        digits,
    } = witness;

    let units = if matches!(state.rules.rules(), PuzzleRules::Classic) {
        vec![]
    } else {
        let related_units = &state.rules.context().units;
        let containing_units = related_units
            .iter()
            .filter(|candidate| cells.iter().any(|cell| candidate.cells.contains(cell)));
        containing_units.map(unit_identity).collect()
    };

    Evidence::Unit {
        unit: unit_identity(unit),
        cells,
        digits,
        premises: state.premises.clone(),
        units: Some(units),
    }
}
