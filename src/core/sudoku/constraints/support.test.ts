import { expect, it } from 'vitest'
import { prepareConstraintSupport, getConstraintSupport } from '@/core/sudoku/constraints/support'
import { prepareRuleComputation } from '@/core/sudoku/constraints/computation'
import { DEFAULT_CATALOGUE_LIMITS } from '@/core/sudoku/constraints/cageCatalogue'
import { compileRules } from '@/core/sudoku/rules/context'
import type { Cage, RuleContext } from '@/core/sudoku/rules/types'
import { createWorkBudget } from '@/core/sudoku/budget'
import { createLogicalWorkspace } from '@/core/sudoku/logic/workspace'
import type { Board, NoteMask } from '@/core/sudoku/types'
import { ARROW_REPEAT_BOARD, ARROW_REPEAT_RULES } from '../../../../tests/fixtures/variants'

const empty: Board = Array(81).fill(0)

const allDomains: readonly NoteMask[] = Array(81).fill(511)

function cageContext(cages: readonly Cage[]): RuleContext {
  const covered = new Set(cages.flatMap((cage) => [...cage.cells]))

  return compileRules({
    kind: 'killer',
    cages: [
      ...cages,
      ...Array.from({ length: 81 }, (_, cell) => cell)
        .filter((cell) => !covered.has(cell))
        .map((cell) => ({ cells: [cell], sum: 1 })),
    ],
  })
}

// Cartesian enumeration is deliberately separate from production combination generation.
function referenceCage(domains: readonly (readonly number[])[], total: number): number[] {
  const supports = domains.map(() => 0)
  function visit(values: readonly number[]): void {
    if (values.length === domains.length) {
      if (new Set(values).size === values.length && values.reduce((a, b) => a + b, 0) === total) {
        values.forEach((digit, index) => {
          supports[index] |= 1 << (digit - 1)
        })
      }

      return
    }

    for (const digit of domains[values.length]) {
      visit([...values, digit])
    }
  }
  visit([])

  return supports
}

it('preserves ordered complete cage support and fixed digits', () => {
  const context = cageContext([{ cells: [1, 0], sum: 3 }])
  const prepared = prepareConstraintSupport(context, createWorkBudget(100000))
  if (prepared.status !== 'ready') {
    throw new Error('Expected prepared support')
  }

  expect(
    prepared.support.get(empty, allDomains, context.constraints[0], createWorkBudget(1000)),
  ).toEqual({ status: 'complete', cells: [1, 0], supports: [3, 3] })
  const fixed = [...empty]
  fixed[1] = 1

  expect(
    prepared.support.get(fixed, allDomains, context.constraints[0], createWorkBudget(1000)),
  ).toEqual({ status: 'complete', cells: [1, 0], supports: [1, 2] })
  fixed[0] = 1

  expect(
    prepared.support.get(fixed, allDomains, context.constraints[0], createWorkBudget(1000)),
  ).toEqual({ status: 'complete', cells: [1, 0], supports: [0, 0] })
})

it('matches independent Cartesian support for fixed domain profiles', () => {
  const context = cageContext([{ cells: [0, 1, 2], sum: 6 }])
  const prepared = prepareConstraintSupport(context, createWorkBudget(100000))
  if (prepared.status !== 'ready') {
    throw new Error('Expected prepared support')
  }

  const profiles = [
    [[1], [2, 3], [2, 3]],
    [[1, 2], [1, 2], [3]],
    [[2], [2], [2]],
    [
      [1, 2, 3],
      [1, 2, 3],
      [1, 2, 3],
    ],
  ]

  for (const profile of profiles) {
    const domains = [...allDomains]
    profile.forEach((values, index) => {
      domains[index] = values.reduce((mask, digit) => mask | (1 << (digit - 1)), 0)
    })
    const result = prepared.support.get(
      empty,
      domains,
      context.constraints[0],
      createWorkBudget(10000),
    )

    expect(result).toEqual({
      status: 'complete',
      cells: [0, 1, 2],
      supports: referenceCage(profile, 6),
    })
  }
})

it('falls back completely at catalogue bounds and retains spent preparation work', () => {
  expect(DEFAULT_CATALOGUE_LIMITS).toEqual({
    maxTuplesPerConstraint: 512,
    maxTuplesPerLayout: 8192,
  })
  const context = cageContext([
    { cells: [0, 1], sum: 3 },
    { cells: [2, 3], sum: 3 },
  ])
  const budget = createWorkBudget(100000)
  const prepared = prepareConstraintSupport(context, budget, {
    maxTuplesPerConstraint: 1,
    maxTuplesPerLayout: 3,
  })
  const layoutLimited = prepareConstraintSupport(context, createWorkBudget(100000), {
    maxTuplesPerConstraint: 512,
    maxTuplesPerLayout: 3,
  })
  if (prepared.status !== 'ready' || layoutLimited.status !== 'ready') {
    throw new Error('Expected bounded fallback')
  }

  const spent = budget.used

  for (const owner of [prepared.support, layoutLimited.support]) {
    for (const constraint of context.constraints.slice(0, 2)) {
      expect(owner.get(empty, allDomains, constraint, budget)).toEqual({
        status: 'complete',
        cells: constraint.kind === 'cage' ? constraint.cells : [],
        supports: [3, 3],
      })
    }
  }

  expect(budget.used).toBeGreaterThan(spent)
  expect(spent).toBeGreaterThan(0)
  expect(() =>
    prepareConstraintSupport(context, budget, {
      maxTuplesPerConstraint: 513,
      maxTuplesPerLayout: 8192,
    }),
  ).toThrow(RangeError)
})

it('keeps large cages and repeated Arrow digits on exact enumeration', () => {
  const large = cageContext([{ cells: [0, 1, 2, 3, 4], sum: 15 }])
  const arrow = compileRules(ARROW_REPEAT_RULES)

  for (const [context, board] of [
    [large, empty],
    [arrow, ARROW_REPEAT_BOARD],
  ] as const) {
    const prepared = prepareConstraintSupport(context, createWorkBudget(100000))
    if (prepared.status !== 'ready') {
      throw new Error('Expected prepared support')
    }

    expect(
      prepared.support.get(board, allDomains, context.constraints[0], createWorkBudget(100000)),
    ).toEqual(
      getConstraintSupport(
        board,
        allDomains,
        context,
        context.constraints[0],
        createWorkBudget(100000),
      ),
    )
  }
})

it('never publishes incomplete catalogues or partial filtering support', () => {
  const context = cageContext([{ cells: [0, 1], sum: 3 }])
  const compilation = createWorkBudget(1)

  expect(prepareConstraintSupport(context, compilation)).toEqual({ status: 'budget-exhausted' })
  expect(compilation.used).toBe(1)
  expect(prepareRuleComputation(context.rules, createWorkBudget(0))).toEqual({
    status: 'budget-exhausted',
  })
  const prepared = prepareConstraintSupport(context, createWorkBudget(100000))
  if (prepared.status !== 'ready') {
    throw new Error('Expected prepared support')
  }

  expect(
    prepared.support.get(empty, allDomains, context.constraints[0], createWorkBudget(1)),
  ).toEqual({ status: 'budget-exhausted' })
  const result = prepared.support.get(
    empty,
    allDomains,
    context.constraints[0],
    createWorkBudget(1000),
  )
  if (result.status !== 'complete') {
    throw new Error('Expected complete support')
  }

  expect(Reflect.set(result.supports, 0, 0)).toBe(true)
  expect(
    prepared.support.get(empty, allDomains, context.constraints[0], createWorkBudget(1000)),
  ).toEqual({ status: 'complete', cells: [0, 1], supports: [3, 3] })
  expect(createLogicalWorkspace(empty, context).cageSupportMemo).not.toBe(
    createLogicalWorkspace(empty, context).cageSupportMemo,
  )
})

it('uses bounded enumeration for a singleton local domain instead of scanning a large catalogue', () => {
  const context = cageContext([{ cells: [0, 1, 2, 3], sum: 18 }])
  const prepared = prepareConstraintSupport(context, createWorkBudget(100000))
  if (prepared.status !== 'ready') {
    throw new Error('Expected a complete size-four catalogue')
  }

  const board = [...empty]
  board[0] = 5
  board[1] = 3
  board[2] = 4
  board[3] = 6
  // One method-selection visit and four assignment extensions suffice for this exact domain.
  const budget = createWorkBudget(5)

  expect(prepared.support.get(board, allDomains, context.constraints[0], budget)).toEqual({
    status: 'complete',
    cells: [0, 1, 2, 3],
    supports: [16, 4, 8, 32],
  })
  expect(budget.used).toBe(5)
})
