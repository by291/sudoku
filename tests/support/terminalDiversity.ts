import type { Board } from '@/core/sudoku/types'

/** Unordered a,b / b,a rectangles are invariant under row/column/digit permutations and transpose. */
export function countIntercalates(board: Board): number {
  let count = 0
  for (let firstRow = 0; firstRow < 8; firstRow++) {
    for (let secondRow = firstRow + 1; secondRow < 9; secondRow++) {
      for (let firstColumn = 0; firstColumn < 8; firstColumn++) {
        for (let secondColumn = firstColumn + 1; secondColumn < 9; secondColumn++) {
          const first = board[firstRow * 9 + firstColumn]
          const second = board[firstRow * 9 + secondColumn]
          if (
            first !== second &&
            first === board[secondRow * 9 + secondColumn] &&
            second === board[secondRow * 9 + firstColumn]
          ) {
            count++
          }
        }
      }
    }
  }

  return count
}
