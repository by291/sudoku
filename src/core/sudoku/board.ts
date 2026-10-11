import { ALL_DIGITS_MASK, BOARD_SIZE, BOX_SIZE, DIGITS, UNIT_SIZE, isDigit } from './types'
import type { Board, CellValue, Digit, NoteMask, ParseResult } from './types'

export type Unit = { kind: 'row' | 'column' | 'box'; index: number }
export type SudokuUnit = Unit & { cells: readonly number[] }
export const UNITS: readonly SudokuUnit[] = ['row', 'column', 'box'].flatMap((kind) =>
  Array.from({ length: UNIT_SIZE }, (_, index): SudokuUnit => ({
    kind: kind === 'row' ? 'row' : kind === 'column' ? 'column' : 'box',
    index,
    cells: Array.from({ length: UNIT_SIZE }, (_, offset) =>
      kind === 'row'
        ? index * UNIT_SIZE + offset
        : kind === 'column'
          ? offset * UNIT_SIZE + index
          : Math.floor(index / BOX_SIZE) * BOX_SIZE * UNIT_SIZE +
            (index % BOX_SIZE) * BOX_SIZE +
            Math.floor(offset / BOX_SIZE) * UNIT_SIZE +
            (offset % BOX_SIZE),
    ),
  })),
)

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
  if (!isCellIndex(cell)) throw new RangeError('Cell index must be an integer from 0 to 80')
  return [
    ...new Set(UNITS.filter((unit) => unit.cells.includes(cell)).flatMap((unit) => unit.cells)),
  ]
    .filter((index) => index !== cell)
    .sort((a, b) => a - b)
}
export const PEERS = Array.from({ length: BOARD_SIZE }, (_, cell) => getPeers(cell))

export function parseBoard(value: unknown): ParseResult<Board> {
  if (!Array.isArray(value) || value.length !== BOARD_SIZE)
    return { valid: false, issues: ['Board must contain 81 cells'] }
  const board: CellValue[] = []
  for (const entry of value) {
    const cell: unknown = entry
    if (cell !== 0 && !isDigit(cell))
      return { valid: false, issues: ['Cells must be integer digits from 0 to 9'] }
    board.push(cell)
  }
  return { valid: true, value: board }
}
export function findConflicts(board: Board): readonly number[] {
  const conflicts = new Set<number>()
  for (const unit of UNITS) {
    for (const digit of DIGITS) {
      const matches = unit.cells.filter((cell) => board[cell] === digit)
      if (matches.length > 1) for (const cell of matches) conflicts.add(cell)
    }
  }
  return [...conflicts].sort((a, b) => a - b)
}
export function isComplete(board: Board): boolean {
  return board.length === BOARD_SIZE && board.every(isDigit) && findConflicts(board).length === 0
}
export function calculateCandidates(board: Board): readonly NoteMask[] {
  return board.map((value, cell) => {
    if (value !== 0) return 0
    let mask = ALL_DIGITS_MASK
    for (const peer of PEERS[cell]) {
      const digit = board[peer]
      if (digit !== 0) mask &= ~maskOf(digit)
    }
    return mask
  })
}
