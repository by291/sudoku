use super::types::LogicalWorkspace;

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
    let bit = mask_of(digit);
    cells
        .iter()
        .copied()
        .filter(|&cell| state.board.values()[cell] == 0 && state.candidates[cell].bits() & bit != 0)
        .collect()
}

pub(crate) fn are_classic_peers(first: usize, second: usize) -> bool {
    first != second
        && (first / 9 == second / 9
            || first % 9 == second % 9
            || (first / 27 == second / 27 && first % 9 / 3 == second % 9 / 3))
}

pub(crate) fn has_peer_collision(cells: &[usize]) -> bool {
    cells.iter().enumerate().any(|(index, &cell)| {
        cells[index + 1..]
            .iter()
            .any(|&other| are_classic_peers(cell, other))
    })
}
