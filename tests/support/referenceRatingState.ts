import type { Board, Digit } from '@reference/core/sudoku/types'
import type { PuzzleRules } from '@reference/core/sudoku/rules/types'
import type { LogicalStep } from '@reference/core/sudoku/logic/types'

/** Replays explicit actions using separate unit construction and digit lists, without engine helpers. */
export function referenceRatingState(
  board: Board,
  rules: PuzzleRules,
  prefix: readonly LogicalStep[],
) {
  const units = new Map<string, readonly number[]>()
  for (let index = 0; index < 9; index++) {
    units.set(
      `row:${index}`,
      Array.from({ length: 9 }, (_, column) => index * 9 + column),
    )
    units.set(
      `column:${index}`,
      Array.from({ length: 9 }, (_, row) => row * 9 + index),
    )
    if (rules.kind !== 'jigsaw') {
      units.set(
        `box:${index}`,
        Array.from(
          { length: 9 },
          (_, offset) =>
            Math.floor(index / 3) * 27 +
            (index % 3) * 3 +
            Math.floor(offset / 3) * 9 +
            (offset % 3),
        ),
      )
    }
  }
  if (rules.kind === 'jigsaw') {
    rules.regions.forEach((cells, index) => units.set(`region:${index}`, cells))
  }
  if (rules.kind === 'diagonal') {
    units.set(
      'diagonal:0',
      Array.from({ length: 9 }, (_, index) => index * 10),
    )
    units.set(
      'diagonal:1',
      Array.from({ length: 9 }, (_, index) => (index + 1) * 8),
    )
  }

  // Arithmetic/path restrictions enter the trace explicitly; base candidates use full units only.
  const peers = Array.from({ length: 81 }, (_, cell) =>
    [...new Set([...units.values()].filter((unit) => unit.includes(cell)).flat())].filter(
      (peer) => peer !== cell,
    ),
  )
  const grid = [...board]
  const digits: readonly Digit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  const candidates: number[][] = grid.map((value, cell) =>
    value === 0 ? digits.filter((digit) => !peers[cell].some((peer) => grid[peer] === digit)) : [],
  )
  for (const step of prefix) {
    if (step.kind === 'elimination') {
      for (const { cell, digit } of step.removals) {
        candidates[cell] = candidates[cell].filter((candidate) => candidate !== digit)
      }
    } else {
      grid[step.cell] = step.digit
      candidates[step.cell] = []
      for (const peer of peers[step.cell]) {
        candidates[peer] = candidates[peer].filter((candidate) => candidate !== step.digit)
      }
    }
  }

  return { board: grid, candidates, units }
}
