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

#[test]
fn review_entries_ignores_blanks_and_reports_every_incorrect_value() {
    let digits: Vec<u8> =
        b"534678912672195348198342567859761423426853791713924856961537284287419635345286179"
            .iter()
            .map(|digit| digit - b'0')
            .collect();
    let solution = Board::try_from(digits.as_slice()).unwrap();
    let mut values = [0_u8; 81];
    values[0] = 5;
    values[2] = 9;
    values[80] = 1;
    let board = Board::try_from(values.as_slice()).unwrap();

    assert_eq!(
        sudoku_core::board::incorrect_entries(&board, &solution),
        vec![2, 80]
    );
}
