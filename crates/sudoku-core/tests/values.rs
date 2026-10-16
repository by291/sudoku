use sudoku_core::types::{Board, CandidateMask, CellIndex, Digit};

#[test]
fn rejects_invalid_board_digit_length_and_mask() {
    assert!(Board::try_from([0_u8; 80].as_slice()).is_err());
    assert!(Board::try_from([0_u8; 82].as_slice()).is_err());
    assert!(Digit::try_from(0).is_err());
    assert!(Digit::try_from(10).is_err());
    assert!(CellIndex::try_from(81_usize).is_err());
    assert!(CandidateMask::try_from(1_u16 << 9).is_err());

    let mut values = [0_u8; 81];
    values[80] = 9;
    let board = Board::try_from(values.as_slice()).unwrap();
    values[80] = 1;

    assert_eq!(values[80], 1);
    assert_eq!(board.values()[80], 9);
    assert_eq!(Digit::try_from(9).unwrap().value(), 9);
    assert_eq!(CellIndex::try_from(80_usize).unwrap().value(), 80);
    assert_eq!(CandidateMask::try_from(511).unwrap().bits(), 511);
}
