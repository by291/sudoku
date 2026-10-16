import type { Board, Digit, Difficulty } from '@/sudoku/contracts'

export const BOARD_SIZE = 81
export const UNIT_SIZE = 9
export const BOX_SIZE = 3

export const ALL_DIGITS_MASK = (1 << UNIT_SIZE) - 1

export const DIGITS: readonly Digit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]

export function isDigit(value: unknown): value is Digit {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 9
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isDifficulty(value: unknown): value is Difficulty {
  return value === 'easy' || value === 'medium' || value === 'hard' || value === 'expert'
}

export function isCellIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < BOARD_SIZE
}

export function isBoard(value: unknown): value is Board {
  return (
    Array.isArray(value) &&
    value.length === BOARD_SIZE &&
    value.every(
      (digit) =>
        typeof digit === 'number' && Number.isInteger(digit) && digit >= 0 && digit <= UNIT_SIZE,
    )
  )
}
