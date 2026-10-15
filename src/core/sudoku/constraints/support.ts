import {
  filterCageCatalogue,
  DEFAULT_CATALOGUE_LIMITS,
  compileCageCatalogue,
} from '@/core/sudoku/constraints/cageCatalogue'
import { digitsIn, maskOf } from '@/core/sudoku/board'
import { consumeWork, withWorkStage } from '@/core/sudoku/budget'
import type { WorkBudget } from '@/core/sudoku/budget'
import { constraintCells } from '@/core/sudoku/rules/context'
import type { RuleConstraint, RuleContext } from '@/core/sudoku/rules/types'
import type { Board, Digit, NoteMask } from '@/core/sudoku/types'
import type {
  ConstraintSupport,
  PreparedConstraintSupport,
  CatalogueLimits,
} from '@/core/sudoku/constraints/types'

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
      const result = compileCageCatalogue(constraint, capacity, budget)
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

            return filterCageCatalogue(cells, domains, tuples, queryBudget)
          })
        },
      },
    }
  })
}
