import { expect, it, vi } from 'vitest'
import * as logic from '@/core/sudoku/logic/solver'
import {
  prepareAssessment,
  prepareAssessmentWithComputation,
  assessPuzzle,
  createAssessmentInput,
} from '@/core/sudoku/rating'
import { prepareRuleComputation } from '@/core/sudoku/constraints/computation'
import { createWorkBudget } from '@/core/sudoku/budget'
import { RATING_FIXTURES } from '../../../tests/fixtures/rating'
import { solvedBoard, uniqueBoard } from '../../../tests/fixtures/sudoku'

const limits = { maxSteps: 500, maxWork: 4000000 }

it.each(RATING_FIXTURES)(
  'completes a matching target with unchanged trace and workload for $id',
  (fixture) => {
    const owner = prepareAssessment(fixture.rules, limits)
    const budget = createWorkBudget(limits.maxWork)
    const result = owner.screenTarget(fixture.board, fixture.difficulty, budget)
    const expected = assessPuzzle(createAssessmentInput(fixture.board, fixture.rules, limits))

    expect(result).toMatchObject({ status: 'matching-target', difficulty: fixture.difficulty })
    if (result.status !== 'matching-target') {
      throw new Error('Expected independently labeled target')
    }
    const used = budget.used
    const completed = result.complete()
    expect(completed).toEqual(expected)
    if (completed.trace[0]) {
      completed.trace[0].technique = 'swordfish'
    }
    expect(result.complete()).toEqual(expected)
    expect(budget.used).toBe(used)
  },
)

it('stops a Hard screen before Expert and retains bounded stalled feedback', () => {
  const fixture = RATING_FIXTURES.find((item) => item.id === 'classic-expert')
  if (!fixture) {
    throw new Error('Missing independent Expert fixture')
  }
  const prepared = prepareRuleComputation(fixture.rules, createWorkBudget(limits.maxWork))
  if (prepared.status !== 'ready') {
    throw new Error('Expected prepared Classic')
  }
  const owner = prepareAssessmentWithComputation(prepared.computation, limits)
  const spy = vi.spyOn(logic, 'analyzeLogicalWorkspace')
  const targetBudget = createWorkBudget(limits.maxWork)
  const result = owner.screenTarget(fixture.board, 'hard', targetBudget)

  expect(result).toMatchObject({
    status: 'target-stalled',
    feedback: { remainingCells: expect.any(Number), deductions: expect.any(Number) },
  })
  expect(spy).toHaveBeenCalledTimes(3)
  expect(spy.mock.lastCall?.[1]).toEqual([
    'naked-single',
    'hidden-single',
    'locked-candidate',
    'naked-pair',
    'hidden-pair',
  ])
  if (result.status !== 'target-stalled') {
    throw new Error('Expert fixture must stall through Hard')
  }
  expect(result.feedback.remainingCells).toBeGreaterThan(0)
  expect(result.feedback.remainingCells).toBeLessThanOrEqual(81)
  spy.mockRestore()
  const fullBudget = createWorkBudget(limits.maxWork)
  expect(owner.assess(fixture.board, fullBudget)).toMatchObject({
    status: 'rated',
    summary: { difficulty: 'expert' },
  })
  expect(targetBudget.used).toBeLessThan(fullBudget.used)
})

it('distinguishes lower tier, invalid, stalled and work versus step exhaustion', () => {
  const owner = prepareAssessment({ kind: 'classic' }, limits)

  expect(owner.screenTarget(uniqueBoard, 'hard', createWorkBudget(limits.maxWork))).toMatchObject({
    status: 'below-target',
    difficulty: 'easy',
  })
  expect(owner.screenTarget([], 'easy', createWorkBudget(10)).status).toBe('invalid')
  expect(owner.screenTarget(uniqueBoard, 'easy', createWorkBudget(0))).toEqual({
    status: 'budget-exhausted',
    cause: 'work-limit',
  })
  expect(
    prepareAssessment({ kind: 'classic' }, { ...limits, maxSteps: 0 }).screenTarget(
      uniqueBoard,
      'easy',
      createWorkBudget(limits.maxWork),
    ),
  ).toEqual({ status: 'budget-exhausted', cause: 'logical-step-limit' })
  expect(
    prepareAssessment({ kind: 'classic' }, { ...limits, maxSteps: 0 }).screenTarget(
      solvedBoard,
      'easy',
      createWorkBudget(limits.maxWork),
    ).status,
  ).toBe('matching-target')
  expect(
    prepareAssessment({ kind: 'diagonal' }, limits).screenTarget(
      uniqueBoard,
      'expert',
      createWorkBudget(limits.maxWork),
    ).status,
  ).toBe('invalid')
})

it('retains a trial snapshot across later clue widening and new workspaces', () => {
  const fixture = RATING_FIXTURES.find((item) => item.id === 'killer-hard')
  if (!fixture) {
    throw new Error('Missing Killer fixture')
  }
  const board = [...fixture.board]
  const owner = prepareAssessment(fixture.rules, limits)
  const result = owner.screenTarget(board, 'hard', createWorkBudget(limits.maxWork))
  if (result.status !== 'matching-target') {
    throw new Error('Expected matching owned trial')
  }
  const expected = result.complete()

  board.fill(0)
  owner.screenTarget(board, 'hard', createWorkBudget(limits.maxWork))

  expect(result.complete()).toEqual(expected)
})
