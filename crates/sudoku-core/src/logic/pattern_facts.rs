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
