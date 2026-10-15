// Own exact local support and layout-static catalogues; domain memo state belongs to each workspace.
import { digitsIn, maskOf } from '@/core/sudoku/board'
import { consumeWork, withWorkStage } from '@/core/sudoku/budget'
import type { WorkBudget } from '@/core/sudoku/budget'
import { constraintCells, prepareRuleContext } from '@/core/sudoku/rules/context'
import type { PuzzleRules, RuleConstraint, RuleContext } from '@/core/sudoku/rules/types'
import { DIGITS } from '@/core/sudoku/types'
import type { Board, Digit, NoteMask } from '@/core/sudoku/types'

export type ConstraintSupport =
  | { status: 'complete'; cells: readonly number[]; supports: readonly NoteMask[] }
  | { status: 'budget-exhausted' }

export type CageSupportMemo = Map<
  Extract<RuleConstraint, { kind: 'cage' }>,
  {
    context: RuleContext
    sum: number
    cells: readonly number[]
    domains: readonly NoteMask[]
    supports: readonly NoteMask[]
  }
>

// Local support is a proof of possibility only within this clue and duplicate peers.
// Unsupported values can be removed; exhaustion cannot prove an unsupported value.
function enumerateConstraintSupport(
  board: Board,
  candidates: readonly NoteMask[],
  context: RuleContext,
  constraint: RuleConstraint,
  budget: WorkBudget,
): ConstraintSupport {
  const cells = constraintCells(constraint)
  const domains = cells.map((cell) =>
    board[cell] === 0 ? digitsIn(candidates[cell]) : [board[cell]],
  )
  const supports = cells.map(() => 0)
  const assigned: Digit[] = []
  let exhausted = false

  function plausible(): boolean {
    for (let i = 0; i < assigned.length; i++) {
      for (let j = 0; j < i; j++) {
        if (assigned[i] === assigned[j] && context.duplicatePeers[cells[i]].includes(cells[j])) {
          return false
        }
      }
    }

    if (constraint.kind === 'thermo') {
      const position = assigned.length - 1
      const digit = assigned[position]

      return (
        (position === 0 || digit > assigned[position - 1]) &&
        digit <= 9 - (cells.length - assigned.length)
      )
    }

    const start = constraint.kind === 'arrow' ? 1 : 0
    const target = constraint.kind === 'arrow' ? assigned[0] : constraint.sum
    let minimum = assigned.slice(start).reduce((sum, digit) => sum + digit, 0)
    let maximum = minimum

    for (let i = Math.max(start, assigned.length); i < domains.length; i++) {
      if (!domains[i].length) {
        return false
      }

      minimum += domains[i][0]
      maximum += domains[i][domains[i].length - 1]
    }

    return minimum <= target && maximum >= target
  }

  function visit(position: number): void {
    if (exhausted) {
      return
    }

    if (position === cells.length) {
      assigned.forEach((digit, index) => {
        supports[index] |= maskOf(digit)
      })

      return
    }

    for (const candidate of domains[position]) {
      if (!consumeWork(budget)) {
        exhausted = true

        return
      }

      assigned.push(candidate)
      if (plausible()) {
        visit(position + 1)
      }

      assigned.pop()
      if (exhausted) {
        return
      }
    }
  }

  visit(0)

  return exhausted ? { status: 'budget-exhausted' } : { status: 'complete', cells, supports }
}

export function getConstraintSupport(
  board: Board,
  candidates: readonly NoteMask[],
  context: RuleContext,
  constraint: RuleConstraint,
  budget: WorkBudget,
): ConstraintSupport {
  return withWorkStage(budget, 'arithmetic', () =>
    enumerateConstraintSupport(board, candidates, context, constraint, budget),
  )
}

export type PreparedConstraintSupport = {
  get(
    board: Board,
    candidates: readonly NoteMask[],
    constraint: RuleConstraint,
    budget: WorkBudget,
  ): ConstraintSupport
}

export type PreparedRuleComputation = {
  readonly context: RuleContext
  readonly support: PreparedConstraintSupport
}

export type CatalogueLimits = { maxTuplesPerConstraint: number; maxTuplesPerLayout: number }

export const DEFAULT_CATALOGUE_LIMITS: Readonly<CatalogueLimits> = Object.freeze({
  maxTuplesPerConstraint: 512,
  maxTuplesPerLayout: 8192,
})

type CatalogueResult =
  | { status: 'complete'; tuples: readonly (readonly NoteMask[])[] }
  | { status: 'fallback' }
  | { status: 'budget-exhausted' }

function compileCage(
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

export function prepareConstraintSupport(
  context: RuleContext,
  budget: WorkBudget,
  limits: Readonly<CatalogueLimits> = DEFAULT_CATALOGUE_LIMITS,
): { status: 'ready'; support: PreparedConstraintSupport } | { status: 'budget-exhausted' } {
  for (const key of ['maxTuplesPerConstraint', 'maxTuplesPerLayout'] as const) {
    if (
      !Number.isSafeInteger(limits[key]) ||
      limits[key] < 0 ||
      limits[key] > DEFAULT_CATALOGUE_LIMITS[key]
    ) {
      throw new RangeError('Catalogue limits may only lower the fixed memory bounds')
    }
  }

  return withWorkStage(budget, 'arithmetic', () => {
    const catalogues = new Map<RuleConstraint, readonly (readonly NoteMask[])[]>()
    let retainedTuples = 0
    for (const constraint of context.constraints) {
      if (constraint.kind !== 'cage' || constraint.cells.length > 4) {
        continue
      }
      const capacity = Math.min(
        limits.maxTuplesPerConstraint,
        limits.maxTuplesPerLayout - retainedTuples,
      )
      const result = compileCage(constraint, capacity, budget)
      if (result.status === 'budget-exhausted') {
        return result
      }
      if (result.status === 'complete') {
        catalogues.set(constraint, result.tuples)
        retainedTuples += result.tuples.length
      }
    }

    return {
      status: 'ready',
      support: {
        get(board, candidates, constraint, queryBudget) {
          return withWorkStage(queryBudget, 'arithmetic', () => {
            if (!context.constraints.includes(constraint)) {
              throw new TypeError('Constraint belongs to a different prepared context')
            }
            const tuples = catalogues.get(constraint)
            if (!tuples) {
              return enumerateConstraintSupport(board, candidates, context, constraint, queryBudget)
            }
            const cells = constraintCells(constraint)
            const domains = cells.map((cell) =>
              board[cell] === 0 ? candidates[cell] : maskOf(board[cell]),
            )
            if (!consumeWork(queryBudget)) {
              return { status: 'budget-exhausted' }
            }
            // A nearly fixed cage has fewer assignments than catalogue rows. Enumerating its
            // actual domains avoids scanning incompatible tuples; preparation is never refunded.
            const domainCombinations = domains.reduce(
              (product, mask) => product * digitsIn(mask).length,
              1,
            )
            if (domainCombinations <= tuples.length) {
              return enumerateConstraintSupport(board, candidates, context, constraint, queryBudget)
            }
            const supports = cells.map(() => 0)
            for (const tuple of tuples) {
              let compatible = true
              for (let index = 0; index < cells.length; index++) {
                if (!consumeWork(queryBudget)) {
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
          })
        },
      },
    }
  })
}

/** All preparation consumes the same request budget; partial catalogues never escape. */
export function prepareRuleComputation(
  rules: PuzzleRules,
  budget: WorkBudget,
): { status: 'ready'; computation: PreparedRuleComputation } | { status: 'budget-exhausted' } {
  const compiled = prepareRuleContext(rules, budget)
  if (compiled.status !== 'ready') {
    return compiled
  }
  const prepared = prepareConstraintSupport(compiled.context, budget)
  if (prepared.status !== 'ready') {
    return prepared
  }

  return {
    status: 'ready',
    computation: Object.freeze({ context: compiled.context, support: prepared.support }),
  }
}
