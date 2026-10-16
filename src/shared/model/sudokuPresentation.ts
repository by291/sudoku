import type { Digit } from '@/sudoku/contracts'

export const BOARD_SIZE = 81
export const UNIT_SIZE = 9
export const BOX_SIZE = 3
export const DIGITS: readonly Digit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]

export function isCellIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < BOARD_SIZE
}

export function isDigit(value: unknown): value is Digit {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= UNIT_SIZE
}

/** Display notes/candidates already computed by the engine; this does not calculate legal moves. */
export function maskDigits(mask: number): readonly Digit[] {
  return DIGITS.filter((digit) => (mask & (1 << (digit - 1))) !== 0)
}
