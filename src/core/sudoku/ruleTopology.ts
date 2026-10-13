import { BOARD_SIZE, BOX_SIZE, UNIT_SIZE } from '@/core/sudoku/types'
import type { ParseResult } from '@/core/sudoku/types'
import type { SudokuUnit } from '@/core/sudoku/ruleTypes'

export function invalidRules(reason: string): ParseResult<never> {
  return { valid: false, issues: [reason] }
}

export function isCellIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < BOARD_SIZE
}

export function parseCells(value: unknown, minimum: number, maximum: number): number[] | null {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    return null
  }

  const result: number[] = []

  for (const entry of value) {
    const candidate: unknown = entry
    if (!isCellIndex(candidate) || result.includes(candidate)) {
      return null
    }

    result.push(candidate)
  }

  return result
}

export function cellsTouch(first: number, second: number, diagonal: boolean): boolean {
  const rowDistance = Math.abs(Math.floor(first / UNIT_SIZE) - Math.floor(second / UNIT_SIZE))
  const columnDistance = Math.abs((first % UNIT_SIZE) - (second % UNIT_SIZE))

  return diagonal ? Math.max(rowDistance, columnDistance) === 1 : rowDistance + columnDistance === 1
}

export function isConnected(region: readonly number[]): boolean {
  const reached = new Set([region[0]])
  const pending = [region[0]]

  while (pending.length) {
    const current = pending.pop()
    if (current === undefined) {
      break
    }

    for (const cell of region) {
      if (reached.has(cell) || !cellsTouch(current, cell, false)) {
        continue
      }

      reached.add(cell)
      pending.push(cell)
    }
  }

  return reached.size === region.length
}

export function isPartition(regions: readonly (readonly number[])[]): boolean {
  const flattened = regions.flat()

  return flattened.length === BOARD_SIZE && new Set(flattened).size === BOARD_SIZE
}

export function isOrderedPath(path: readonly number[]): boolean {
  return path.slice(1).every((cell, index) => cellsTouch(path[index], cell, true))
}

// Unit ordering is also the stable ordering used by logical techniques and hint evidence.
export const CLASSIC_UNITS: readonly SudokuUnit[] = [
  ...Array.from({ length: UNIT_SIZE }, (_, index): SudokuUnit => ({
    kind: 'row',
    index,
    cells: Array.from({ length: UNIT_SIZE }, (_, offset) => index * UNIT_SIZE + offset),
  })),
  ...Array.from({ length: UNIT_SIZE }, (_, index): SudokuUnit => ({
    kind: 'column',
    index,
    cells: Array.from({ length: UNIT_SIZE }, (_, offset) => offset * UNIT_SIZE + index),
  })),
  ...Array.from({ length: UNIT_SIZE }, (_, index): SudokuUnit => ({
    kind: 'box',
    index,
    cells: Array.from(
      { length: UNIT_SIZE },
      (_, offset) =>
        Math.floor(index / BOX_SIZE) * BOX_SIZE * UNIT_SIZE +
        (index % BOX_SIZE) * BOX_SIZE +
        Math.floor(offset / BOX_SIZE) * UNIT_SIZE +
        (offset % BOX_SIZE),
    ),
  })),
]

export function compileUnits(units: readonly SudokuUnit[]) {
  return { units, constraints: [], duplicateGroups: units.map((unit) => unit.cells) }
}
