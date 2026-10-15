import { maskOf } from '@/core/sudoku/board'
import { consumeWork } from '@/core/sudoku/budget'
import type { WorkBudget } from '@/core/sudoku/budget'
import type { RuleConstraint } from '@/core/sudoku/rules/types'
import { DIGITS } from '@/core/sudoku/types'
import type { Digit, NoteMask } from '@/core/sudoku/types'
import type { CatalogueLimits, ConstraintSupport } from '@/core/sudoku/constraints/types'

export const DEFAULT_CATALOGUE_LIMITS: Readonly<CatalogueLimits> = Object.freeze({
  maxTuplesPerConstraint: 512,
  maxTuplesPerLayout: 8192,
})

export type CatalogueResult =
  | { status: 'complete'; tuples: readonly (readonly NoteMask[])[] }
  | { status: 'fallback' }
  | { status: 'budget-exhausted' }

export function compileCageCatalogue(
  cage: Extract<RuleConstraint, { kind: 'cage' }>,
  capacity: number,
  budget: WorkBudget,
): CatalogueResult {
  const tuples: NoteMask[][] = []
  const combination: Digit[] = []
  const assigned: Digit[] = []
  let exhausted = false
  let overflow = false

  function permute(used: number): void {
    if (assigned.length === combination.length) {
      if (tuples.length >= capacity) {
        overflow = true
        return
      }
      tuples.push(assigned.map(maskOf))
      return
    }
    for (const digit of combination) {
      if ((used & maskOf(digit)) !== 0) {
        continue
      }
      if (!consumeWork(budget)) {
        exhausted = true
        return
      }
      assigned.push(digit)
      permute(used | maskOf(digit))
      assigned.pop()
      if (exhausted || overflow) {
        return
      }
    }
  }

  function combine(start: number, sum: number): void {
    if (combination.length === cage.cells.length) {
      if (sum === cage.sum) {
        permute(0)
      }
      return
    }
    const remaining = cage.cells.length - combination.length
    for (const digit of DIGITS) {
      if (digit < start || digit > 10 - remaining) {
        continue
      }
      if (!consumeWork(budget)) {
        exhausted = true
        return
      }
      const minimum = sum + remaining * digit + (remaining * (remaining - 1)) / 2
      const maximum = sum + digit + (remaining - 1) * 9 - ((remaining - 1) * (remaining - 2)) / 2
      if (minimum > cage.sum || maximum < cage.sum) {
        continue
      }
      combination.push(digit)
      combine(digit + 1, sum + digit)
      combination.pop()
      if (exhausted || overflow) {
        return
      }
    }
  }

  combine(1, 0)
  if (exhausted) {
    return { status: 'budget-exhausted' }
  }
  if (overflow) {
    return { status: 'fallback' }
  }

  return { status: 'complete', tuples: Object.freeze(tuples.map((tuple) => Object.freeze(tuple))) }
}

/** Filters complete ordered tuples; incomplete support never escapes. */
export function filterCageCatalogue(
  cells: readonly number[],
  domains: readonly NoteMask[],
  tuples: readonly (readonly NoteMask[])[],
  budget: WorkBudget,
): ConstraintSupport {
  const supports = cells.map(() => 0)
  for (const tuple of tuples) {
    let compatible = true
    for (let index = 0; index < cells.length; index++) {
      if (!consumeWork(budget)) {
        return { status: 'budget-exhausted' }
      }
      if ((tuple[index] & domains[index]) === 0) {
        compatible = false
        break
      }
    }
    if (compatible) {
      tuple.forEach((mask, index) => {
        supports[index] |= mask
      })
    }
  }

  return { status: 'complete', cells: [...cells], supports }
}
