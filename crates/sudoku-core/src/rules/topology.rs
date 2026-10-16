use super::types::{CompiledVariantRules, SudokuUnit, UnitKind};
use crate::types::{BOARD_SIZE, BOX_SIZE, UNIT_SIZE};

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

pub(crate) fn cells_touch(first: usize, second: usize, diagonal: bool) -> bool {
    let row_distance = (first / UNIT_SIZE).abs_diff(second / UNIT_SIZE);
    let column_distance = (first % UNIT_SIZE).abs_diff(second % UNIT_SIZE);
    if diagonal {
        row_distance.max(column_distance) == 1
    } else {
        row_distance + column_distance == 1
    }
}

pub(super) fn connected(cells: &[usize]) -> bool {
    let Some(&first) = cells.first() else {
        return false;
    };
    let mut reached = [false; BOARD_SIZE];
    reached[first] = true;
    let mut pending = vec![first];
    while let Some(current) = pending.pop() {
        for &cell in cells {
            if !reached[cell] && cells_touch(current, cell, false) {
                reached[cell] = true;
                pending.push(cell);
            }
        }
    }
    cells.iter().all(|&cell| reached[cell])
}

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

pub(super) fn ordered_path(cells: &[usize]) -> bool {
    cells
        .windows(2)
        .all(|pair| cells_touch(pair[0], pair[1], true))
}

// Rows, columns, then boxes define the stable logical-technique and evidence ordering.
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

pub(super) fn compile_units(units: Vec<SudokuUnit>) -> CompiledVariantRules {
    let duplicate_groups = units.iter().map(|unit| unit.cells.clone()).collect();
    CompiledVariantRules {
        units,
        constraints: vec![],
        duplicate_groups,
    }
}
