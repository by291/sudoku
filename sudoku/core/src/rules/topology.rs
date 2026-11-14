use super::types::{CompiledVariantRules, SudokuUnit, UnitKind};
use crate::types::{BOARD_SIZE, BOX_SIZE, UNIT_SIZE};

pub(crate) enum Adjacency {
    Orthogonal,
    IncludingDiagonal,
}

/// Check the number, range and uniqueness of cells before indexing topology arrays.
pub(super) fn valid_cells(cells: &[usize], minimum: usize, maximum: usize) -> bool {
    if !(minimum..=maximum).contains(&cells.len()) {
        return false;
    }

    let mut seen = [false; BOARD_SIZE];
    for &cell in cells {
        if cell >= BOARD_SIZE || seen[cell] {
            return false;
        }
        seen[cell] = true;
    }

    true
}

/// Test whether two distinct cells touch under the selected adjacency rule.
pub(crate) fn cells_touch(first: usize, second: usize, adjacency: Adjacency) -> bool {
    let row_distance = (first / UNIT_SIZE).abs_diff(second / UNIT_SIZE);
    let column_distance = (first % UNIT_SIZE).abs_diff(second % UNIT_SIZE);
    match adjacency {
        Adjacency::Orthogonal => row_distance + column_distance == 1,
        Adjacency::IncludingDiagonal => row_distance.max(column_distance) == 1,
    }
}

/// Verify that validated cells form one orthogonally connected group.
pub(super) fn connected(cells: &[usize]) -> bool {
    let Some(&first) = cells.first() else {
        return false;
    };

    let mut reached = [false; BOARD_SIZE];
    reached[first] = true;
    let mut pending = vec![first];

    while let Some(current) = pending.pop() {
        for &cell in cells {
            if !reached[cell] && cells_touch(current, cell, Adjacency::Orthogonal) {
                reached[cell] = true;
                pending.push(cell);
            }
        }
    }

    cells.iter().all(|&cell| reached[cell])
}

/// Verify that every cell belongs to exactly one group.
pub(super) fn partition<'a>(groups: impl IntoIterator<Item = &'a [usize]>) -> bool {
    let mut seen = [false; BOARD_SIZE];
    let mut count = 0;

    for cells in groups {
        for &cell in cells {
            if cell >= BOARD_SIZE || seen[cell] {
                return false;
            }

            seen[cell] = true;
            count += 1;
        }
    }

    count == BOARD_SIZE
}

/// Verify that successive cells touch, including at corners.
pub(super) fn ordered_path(cells: &[usize]) -> bool {
    cells
        .windows(2)
        .all(|pair| cells_touch(pair[0], pair[1], Adjacency::IncludingDiagonal))
}

/// Build rows, columns and boxes in stable logical-technique and evidence order.
pub(super) fn classic_units() -> Vec<SudokuUnit> {
    let mut units = Vec::with_capacity(UNIT_SIZE * 3);
    for index in 0..UNIT_SIZE {
        units.push(SudokuUnit {
            kind: UnitKind::Row,
            index,
            cells: (0..UNIT_SIZE)
                .map(|offset| index * UNIT_SIZE + offset)
                .collect(),
        });
    }

    for index in 0..UNIT_SIZE {
        units.push(SudokuUnit {
            kind: UnitKind::Column,
            index,
            cells: (0..UNIT_SIZE)
                .map(|offset| offset * UNIT_SIZE + index)
                .collect(),
        });
    }

    for index in 0..UNIT_SIZE {
        let cells = (0..UNIT_SIZE)
            .map(|offset| {
                index / BOX_SIZE * BOX_SIZE * UNIT_SIZE
                    + index % BOX_SIZE * BOX_SIZE
                    + offset / BOX_SIZE * UNIT_SIZE
                    + offset % BOX_SIZE
            })
            .collect();
        units.push(SudokuUnit {
            kind: UnitKind::Box,
            index,
            cells,
        });
    }

    units
}

/// Compile complete units into both full-unit rules and duplicate exclusions.
pub(super) fn compile_units(units: Vec<SudokuUnit>) -> CompiledVariantRules {
    let duplicate_groups = units.iter().map(|unit| unit.cells.clone()).collect();
    CompiledVariantRules {
        units,
        constraints: vec![],
        duplicate_groups,
    }
}
