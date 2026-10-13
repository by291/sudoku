import { ALL_DIGITS_MASK, BOARD_SIZE, DIGITS, UNIT_SIZE, isDigit } from '@/core/sudoku/types'
import type { Board, CellValue, Digit, NoteMask, ParseResult } from '@/core/sudoku/types'

export type { Unit, SudokuUnit } from '@/core/sudoku/rules'
import type { SudokuUnit } from '@/core/sudoku/rules'
import type { RuleContext } from '@/core/sudoku/rules'
import { CLASSIC_CONTEXT, satisfiesConstraint } from '@/core/sudoku/rules'

export const UNITS: readonly SudokuUnit[] = CLASSIC_CONTEXT.units

export function maskOf(digit: Digit): NoteMask {
  return 1 << (digit - 1)
}

export function digitsIn(mask: NoteMask): readonly Digit[] {
  return DIGITS.filter((digit) => (mask & maskOf(digit)) !== 0)
}

export function isCellIndex(cell: number): boolean {
  return Number.isInteger(cell) && cell >= 0 && cell < BOARD_SIZE
}

export function getPeers(cell: number): readonly number[] {
  if (!isCellIndex(cell)) {
    throw new RangeError('Cell index must be an integer from 0 to 80')
  }

  return [
    ...new Set(UNITS.filter((unit) => unit.cells.includes(cell)).flatMap((unit) => unit.cells)),
  ]
    .filter((index) => index !== cell)
    .sort((a, b) => a - b)
}

export const PEERS = Array.from({ length: BOARD_SIZE }, (_, cell) => getPeers(cell))

export function parseBoard(value: unknown): ParseResult<Board> {
  if (!Array.isArray(value) || value.length !== BOARD_SIZE) {
    return { valid: false, issues: ['Board must contain 81 cells'] }
  }

  const board: CellValue[] = []

  for (const entry of value) {
    const cell: unknown = entry
    if (cell !== 0 && !isDigit(cell)) {
      return { valid: false, issues: ['Cells must be integer digits from 0 to 9'] }
    }

    board.push(cell)
  }

  return { valid: true, value: board }
}

export function findConflicts(board: Board): readonly number[] {
  const conflicts = new Set<number>()

  for (const unit of UNITS) {
    for (const digit of DIGITS) {
      const matches = unit.cells.filter((cell) => board[cell] === digit)
      if (matches.length > 1) {
        for (const cell of matches) {
          conflicts.add(cell)
        }
      }
    }
  }

  return [...conflicts].sort((a, b) => a - b)
}

export function isComplete(board: Board, context: RuleContext = CLASSIC_CONTEXT): boolean {
  return (
    board.length === BOARD_SIZE &&
    board.every(isDigit) &&
    context.units.every(
      (unit) => new Set(unit.cells.map((cell) => board[cell])).size === UNIT_SIZE,
    ) &&
    context.constraints.every((constraint) => satisfiesConstraint(board, constraint))
  )
}

export function calculateBaseCandidates(board: Board, context: RuleContext): readonly NoteMask[] {
  return board.map((value, cell) => {
    if (value !== 0) {
      return 0
    }

    let mask = ALL_DIGITS_MASK

    for (const peer of context.duplicatePeers[cell]) {
      if (board[peer] !== 0) {
        mask &= ~maskOf(board[peer])
      }
    }

    return mask
  })
}

export function calculateCandidates(board: Board): readonly NoteMask[] {
  return board.map((value, cell) => {
    if (value !== 0) {
      return 0
    }

    let mask = ALL_DIGITS_MASK

    for (const peer of PEERS[cell]) {
      const digit = board[peer]
      if (digit !== 0) {
        mask &= ~maskOf(digit)
      }
    }

    return mask
  })
}
