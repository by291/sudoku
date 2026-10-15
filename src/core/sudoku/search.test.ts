import { expect, it } from 'vitest'
import { countSolutions } from '@/core/sudoku/search'
import { countReferenceSolutions } from '../../../tests/support/referenceSudoku'
import {
  uniqueBoard,
  solvedBoard,
  emptyBoard,
  conflictingBoard,
  unsatisfiableBoard,
} from '../../../tests/fixtures/sudoku'
import { compileRules } from '@/core/sudoku/rules/context'
import { VARIANT_FIXTURES } from '../../../tests/fixtures/variants'
import { VARIANT_TEMPLATES } from '@/core/sudoku/variantTemplates'
import { referenceCountSolutions } from '../../../tests/support/referenceVariants'
import { createWorkBudget } from '@/core/sudoku/budget'
import { CLASSIC_PUZZLE_FIXTURES } from '../../../tests/fixtures/classicPuzzles'

const propagationFixtures = [
  ...CLASSIC_PUZZLE_FIXTURES.filter((fixture) =>
    ['hard', 'expert'].includes(fixture.difficulty),
  ).map((fixture) => ({ ...fixture, rules: { kind: 'classic' as const } })),
  ...Object.values(VARIANT_TEMPLATES).map((tiers) => tiers.hard[0]),
]

it.each(propagationFixtures)(
  'counts a sparse $rules.kind/$difficulty fixture within a small branching allowance',
  (fixture) => {
    const givens = [...fixture.givens]
    const context = compileRules(fixture.rules)
    const workBudget = createWorkBudget(50000)

    const result = countSolutions(givens, {
      maxSolutions: 2,
      nodeBudget: 24,
      context,
      workBudget,
    })

    expect(referenceCountSolutions(givens, fixture.rules)).toEqual({
      count: 1,
      solution: fixture.solution,
    })
    expect(result).toMatchObject({ status: 'complete', count: 1, solution: fixture.solution })
    expect(result.nodesVisited).toBeLessThanOrEqual(24)
    expect(workBudget.used).toBeLessThanOrEqual(workBudget.limit)
    expect(givens).toEqual(fixture.givens)
  },
)

it.each(propagationFixtures)(
  'keeps late $rules.kind/$difficulty exhaustion inconclusive and retry state isolated',
  (fixture) => {
    const context = compileRules(fixture.rules)
    const complete = countSolutions(fixture.givens, {
      maxSolutions: 2,
      nodeBudget: 1000000,
      context,
    })
    expect(complete.status).toBe('complete')
    const budget = createWorkBudget(complete.workUsed + 4)
    budget.used = 5

    const incomplete = countSolutions(fixture.givens, {
      maxSolutions: 2,
      nodeBudget: 1000000,
      context,
      workBudget: budget,
    })
    const retry = countSolutions(fixture.givens, { maxSolutions: 2, nodeBudget: 1000000, context })

    expect(incomplete.status).toBe('budget-exhausted')
    expect(budget.used).toBeLessThanOrEqual(budget.limit)
    expect(retry).toEqual(complete)
  },
)

it('agrees with independent counting on zero and multiple small-cage Killer solutions', () => {
  const fixture = VARIANT_TEMPLATES.killer.hard[0]
  if (fixture.rules.kind !== 'killer') {
    throw new Error('Expected Killer rules')
  }
  const nearlyComplete = [...fixture.solution]
  nearlyComplete[0] = 0
  nearlyComplete[8] = 0
  const contradictory = {
    ...fixture.rules,
    cages: fixture.rules.cages.map((cage, index) =>
      index === 0 ? { ...cage, sum: cage.sum + 1 } : cage,
    ),
  }
  // Every column fixes its missing digit, but the first cage contradicts that forced total.
  expect(referenceCountSolutions(nearlyComplete, contradictory).count).toBe(0)
  expect(
    countSolutions(nearlyComplete, {
      maxSolutions: 2,
      nodeBudget: 1000000,
      context: compileRules(contradictory),
    }),
  ).toMatchObject({ status: 'complete', count: 0 })

  const empty = Array(81).fill(0)
  const independent = referenceCountSolutions(empty, fixture.rules)
  expect(independent.count).toBe(2)
  expect(
    countSolutions(empty, {
      maxSolutions: 2,
      nodeBudget: 1000000,
      context: compileRules(fixture.rules),
    }),
  ).toMatchObject({ status: 'complete', count: 2 })
})

it('retains bounded general search for large Killer cages', () => {
  const rules = {
    kind: 'killer' as const,
    cages: Array.from({ length: 9 }, (_, row) => ({
      cells: Array.from({ length: 9 }, (_, column) => row * 9 + column),
      sum: 45,
    })),
  }
  const context = compileRules(rules)
  // Node visits and aggregate preparation work are separate allowances.
  const result = countSolutions(solvedBoard, {
    maxSolutions: 2,
    nodeBudget: 1000,
    context,
    workBudget: createWorkBudget(100000),
  })

  expect(result).toMatchObject({ status: 'complete', count: 1, solution: solvedBoard })
  expect(countSolutions(emptyBoard, { maxSolutions: 2, nodeBudget: 0, context }).status).toBe(
    'budget-exhausted',
  )
})

it.each([
  { board: solvedBoard, expected: 1 },
  { board: uniqueBoard, expected: 1 },
  { board: emptyBoard, expected: 2 },
  { board: conflictingBoard, expected: 0 },
  { board: unsatisfiableBoard, expected: 0 },
])('distinguishes zero one and multiple solutions: $expected', ({ board, expected }) => {
  const result = countSolutions(board, { maxSolutions: 2, nodeBudget: 1000000 })

  expect(result).toMatchObject({ status: 'complete', count: expected })
  expect(countReferenceSolutions(board, 2)).toBe(expected)
  if (expected === 1) {
    expect(result).toMatchObject({ solution: solvedBoard })
  }
})
it('never reports uniqueness after budget exhaustion', () => {
  expect(countSolutions(emptyBoard, { maxSolutions: 2, nodeBudget: 0 })).toEqual({
    status: 'budget-exhausted',
    nodesVisited: 0,
    workUsed: 0,
  })
  expect(
    countSolutions(uniqueBoard, {
      maxSolutions: 2,
      nodeBudget: 1,
      workBudget: createWorkBudget(2),
    }),
  ).toMatchObject({
    status: 'budget-exhausted',
    nodesVisited: 1,
  })
})
it('does not mutate the source puzzle', () => {
  const board = [...uniqueBoard]
  countSolutions(board, { maxSolutions: 2, nodeBudget: 1000000 })

  expect(board).toEqual(uniqueBoard)
})

it('charges puzzle-specific standalone preparation before its first exact node', () => {
  const budget = createWorkBudget(1)

  expect(
    countSolutions(VARIANT_FIXTURES.diagonal.givens, {
      maxSolutions: 2,
      nodeBudget: 1000,
      workBudget: budget,
      context: compileRules(VARIANT_FIXTURES.diagonal.rules),
    }),
  ).toEqual({
    status: 'budget-exhausted',
    nodesVisited: 0,
    workUsed: 1,
  })
  expect(budget.used).toBe(1)
})
