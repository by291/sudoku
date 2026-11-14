use super::types::LogicalWorkspace;
use crate::types::{BOX_SIZE, UNIT_SIZE};

pub(crate) fn mask_of(digit: u8) -> u16 {
    1 << (digit - 1)
}

pub(crate) fn digits_in(bits: u16) -> Vec<u8> {
    (1..=9)
        .filter(|&digit| bits & mask_of(digit) != 0)
        .collect()
}

pub(crate) fn candidate_positions(
    state: &LogicalWorkspace,
    cells: &[usize],
    digit: u8,
) -> Vec<usize> {
    candidate_position_iter(state, cells, digit).collect()
}

pub(crate) fn candidate_position_iter<'a>(
    state: &'a LogicalWorkspace,
    cells: &'a [usize],
    digit: u8,
) -> impl Iterator<Item = usize> + Clone + 'a {
    let bit = mask_of(digit);
    cells.iter().copied().filter(move |&cell| {
        state.board.values()[cell] == 0 && state.candidates[cell].bits() & bit != 0
    })
}

pub(crate) fn are_classic_peers(first: usize, second: usize) -> bool {
    if first == second {
        return false;
    }

    let first_row = first / UNIT_SIZE;
    let first_column = first % UNIT_SIZE;
    let second_row = second / UNIT_SIZE;
    let second_column = second % UNIT_SIZE;
    let is_same_box = (first_row / BOX_SIZE == second_row / BOX_SIZE)
        && (first_column / BOX_SIZE == second_column / BOX_SIZE);

    first_row == second_row || first_column == second_column || is_same_box
}

pub(crate) fn has_peer_collision(cells: &[usize]) -> bool {
    cells.iter().enumerate().any(|(index, &cell)| {
        cells[index + 1..]
            .iter()
            .any(|&other| are_classic_peers(cell, other))
    })
}
