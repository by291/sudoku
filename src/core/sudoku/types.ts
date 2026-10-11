export type Digit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
export type CellValue = 0 | Digit
export type Board = readonly CellValue[]
export type NoteMask = number
export type Difficulty = 'easy' | 'medium' | 'hard'
export type ParseResult<T> = { valid: true; value: T } | { valid: false; issues: readonly string[] }
export type SearchResult =
  | { status: 'complete'; count: 0 | 1 | 2; solution: Board | null; nodesVisited: number }
  | { status: 'budget-exhausted'; nodesVisited: number }

export const BOARD_SIZE = 81
export const UNIT_SIZE = 9
export const BOX_SIZE = 3
export const ALL_DIGITS_MASK = 511
export const DIGITS: readonly Digit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]
export function isDigit(value: unknown): value is Digit {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 9
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export function isDifficulty(value: unknown): value is Difficulty {
  return value === 'easy' || value === 'medium' || value === 'hard'
}
