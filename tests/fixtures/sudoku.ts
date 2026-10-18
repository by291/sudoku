import type { Board, CellValue } from '@/sudoku/contracts'

export function fixtureBoard(text: string): Board {
  return Array.from(text, (character): CellValue => {
    const value = Number(character)
    if (
      value === 0 ||
      value === 1 ||
      value === 2 ||
      value === 3 ||
      value === 4 ||
      value === 5 ||
      value === 6 ||
      value === 7 ||
      value === 8 ||
      value === 9
    )
      return value
    throw new Error('Invalid literal fixture')
  })
}
export const solvedBoard = fixtureBoard(
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179',
)
export const uniqueBoard = fixtureBoard(
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079',
)
export const emptyBoard: Board = Array(81).fill(0)
export const conflictingBoard: Board = uniqueBoard.map((value, index) => (index === 2 ? 5 : value))
export const unsatisfiableBoard: Board = uniqueBoard.map((value, index) =>
  index === 2 ? 1 : value,
)
