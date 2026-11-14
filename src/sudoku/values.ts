import type { Board, Digit, Difficulty } from '@/sudoku/contracts'

export const BOARD_SIZE = 81
export const UNIT_SIZE = 9
export const BOX_SIZE = 3

export const ALL_DIGITS_MASK = (1 << UNIT_SIZE) - 1

export const DIGITS: readonly Digit[] = Array.from(
  { length: UNIT_SIZE },
  (_, index) => index + 1,
).filter(isDigit)

/** Check all indexed elements, including positions that array iteration would skip. */
export function isDenseArrayOf<Item>(
  value: unknown,
  isItem: (item: unknown) => item is Item,
): value is Item[] {
  if (!Array.isArray(value)) {
    return false
  }

  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index) || !isItem(value[index])) {
      return false
    }
  }

  return true
}

/** Check whether a value is a nonzero Sudoku digit. */
export function isDigit(value: unknown): value is Digit {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= UNIT_SIZE
}

/** Narrow an object-shaped input before inspecting its properties. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Recognize the canonical difficulty labels. */
export function isDifficulty(value: unknown): value is Difficulty {
  return value === 'easy' || value === 'medium' || value === 'hard' || value === 'expert'
}

/** Check whether a value is a valid row-major cell index. */
export function isCellIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < BOARD_SIZE
}

/** Validate a dense board, where zero represents an empty cell. */
export function isBoard(value: unknown): value is Board {
  return (
    Array.isArray(value) &&
    value.length === BOARD_SIZE &&
    isDenseArrayOf(value, (digit): digit is Board[number] => digit === 0 || isDigit(digit))
  )
}
