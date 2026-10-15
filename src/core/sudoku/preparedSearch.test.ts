import { expect, it } from 'vitest'
import { prepareRuleComputation } from '@/core/sudoku/constraintSupport'
import { prepareExactValidator, countSolutions } from '@/core/sudoku/search'
import { createWorkBudget } from '@/core/sudoku/budget'
import {
  uniqueBoard,
  solvedBoard,
  emptyBoard,
  conflictingBoard,
  unsatisfiableBoard,
} from '../../../tests/fixtures/sudoku'
import { VARIANT_FIXTURES } from '../../../tests/fixtures/variants'
import { referenceCountSolutions } from '../../../tests/support/referenceVariants'
import { CLASSIC_PUZZLE_FIXTURES } from '../../../tests/fixtures/classicPuzzles'
import type { PuzzleRules } from '@/core/sudoku/rules/types'

const fixtures = [
  { rules: { kind: 'classic' } as const, givens: uniqueBoard, solution: solvedBoard },
  ...Object.values(VARIANT_FIXTURES),
]

it.each(fixtures)('isolates prepared $rules.kind probes and returned solutions', (fixture) => {
  const preparation = prepareRuleComputation(fixture.rules, createWorkBudget(100000))
  if (preparation.status !== 'ready') {
    throw new Error('Expected prepared fixture')
  }
  const validator = prepareExactValidator(preparation.computation)
  const initial = validator.count(fixture.givens, createWorkBudget(100000), 1000)
  const contradiction = [...fixture.solution]
  contradiction[1] = contradiction[0]

  expect(initial).toMatchObject({ status: 'complete', count: 1, solution: fixture.solution })
  expect(referenceCountSolutions(fixture.givens, fixture.rules)).toEqual({
    count: 1,
    solution: fixture.solution,
  })
  expect(validator.count(contradiction, createWorkBudget(100000), 1000)).toMatchObject({
    status: 'complete',
    count: 0,
  })
  expect(validator.count(fixture.givens, createWorkBudget(1), 1000).status).toBe('budget-exhausted')
  if (initial.status !== 'complete' || !initial.solution) {
    throw new Error('Expected owned unique solution')
  }
  Reflect.set(initial.solution, 0, 9)

  expect(validator.count(fixture.givens, createWorkBudget(100000), 1000)).toMatchObject({
    status: 'complete',
    count: 1,
    solution: fixture.solution,
  })
  expect(
    countSolutions(fixture.givens, {
      maxSolutions: 2,
      nodeBudget: 100000,
      context: preparation.computation.context,
    }),
  ).toMatchObject({ status: 'complete', count: 1, solution: fixture.solution })
})

it('distinguishes independent zero one and multiple counts with reused topology', () => {
  const rules: PuzzleRules = { kind: 'classic' }
  const prepared = prepareRuleComputation(rules, createWorkBudget(100000))
  if (prepared.status !== 'ready') {
    throw new Error('Expected static topology')
  }
  const validator = prepareExactValidator(prepared.computation)

  for (const [board, count] of [
    [conflictingBoard, 0],
    [unsatisfiableBoard, 0],
    [uniqueBoard, 1],
    [emptyBoard, 2],
  ] as const) {
    expect(validator.count(board, createWorkBudget(100000), 10000)).toMatchObject({
      status: 'complete',
      count,
    })
    expect(referenceCountSolutions(board, rules).count).toBe(count)
  }
})

it('restores failed branches and every interrupted traversal before the next probe', () => {
  const fixture = CLASSIC_PUZZLE_FIXTURES.find((item) => item.difficulty === 'expert')
  if (!fixture) {
    throw new Error('Missing fixed Expert branch fixture')
  }
  const prepared = prepareRuleComputation({ kind: 'classic' }, createWorkBudget(10000))
  if (prepared.status !== 'ready') {
    throw new Error('Expected prepared fixture')
  }
  const validator = prepareExactValidator(prepared.computation)
  const complete = validator.count(fixture.givens, createWorkBudget(100000), 10000)

  expect(complete).toMatchObject({ status: 'complete', count: 1, solution: fixture.solution })
  expect(complete.nodesVisited).toBeGreaterThan(1)
  for (const cap of [0, 1, 80, 120, 240, 500, complete.workUsed - 1]) {
    const budget = createWorkBudget(cap)
    const interrupted = validator.count(fixture.givens, budget, 10000)

    expect(interrupted.status).toBe('budget-exhausted')
    expect(budget.used).toBeLessThanOrEqual(cap)
    expect(validator.count(fixture.givens, createWorkBudget(100000), 10000)).toEqual(complete)
  }
})
