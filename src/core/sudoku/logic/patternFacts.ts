import { maskOf, PEERS } from '@/core/sudoku/board'
import type { LogicalState } from '@/core/sudoku/logic/types'
import type { Digit } from '@/core/sudoku/types'

export function available(state: LogicalState, cells: readonly number[], digit: Digit): number[] {
  const matches: number[] = []
  const bit = maskOf(digit)
  for (let index = 0; index < cells.length; index++) {
    const cell = cells[index]
    if (state.board[cell] === 0 && (state.candidates[cell] & bit) !== 0) {
      matches.push(cell)
    }
  }

  return matches
}

export function collision(cells: readonly number[]): boolean {
  return cells.some((cell, index) =>
    cells.slice(index + 1).some((other) => PEERS[cell].includes(other)),
  )
}
