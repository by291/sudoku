import { expect, it } from 'vitest'
import { assessPuzzle, prepareAssessment } from '@/core/sudoku/rating/assessment'
import { createAssessmentInput } from '@/core/sudoku/rating/input'
import { createWorkBudget } from '@/core/sudoku/budget'
import { RATING_FIXTURES } from '../../../../tests/fixtures/rating'
import { solvedBoard, uniqueBoard } from '../../../../tests/fixtures/sudoku'

const limits = { maxSteps: 500, maxWork: 4000000 }

it.each(RATING_FIXTURES)('classifies $id before producing its complete assessment', (fixture) => {
  const prepared = prepareAssessment(fixture.rules, limits)
  const trialBudget = { limit: limits.maxWork, used: 100 }
  const completeBudget = { ...trialBudget }
  const before = [...fixture.board]

  const trial = prepared.screen(fixture.board, trialBudget)
  const expected = prepareAssessment(fixture.rules, limits).assess(fixture.board, completeBudget)

  expect(trial).toMatchObject({ status: 'rated', difficulty: fixture.difficulty })
  expect(trial).not.toHaveProperty('summary')
  if (trial.status !== 'rated') {
    throw new Error('Missing known rated trial')
  }
  const workBeforeCompletion = trialBudget.used

  expect(trial.complete()).toEqual(expected)
  expect(trialBudget.used).toBe(workBeforeCompletion)
  expect(trialBudget).toEqual(completeBudget)
  expect(fixture.board).toEqual(before)
})

it('retains an owned screened board after later clue changes and assessments', () => {
  const prepared = prepareAssessment({ kind: 'classic' }, limits)
  const board = [...uniqueBoard]
  const expected = assessPuzzle(createAssessmentInput(board, { kind: 'classic' }, limits))
  const trial = prepared.screen(board, createWorkBudget(limits.maxWork))

  board.fill(0)
  prepared.screen(solvedBoard, createWorkBudget(limits.maxWork))

  if (trial.status !== 'rated') {
    throw new Error('Missing known rated trial')
  }
  expect(trial.complete()).toEqual(expected)
})

it('retains invalid and incomplete trial outcomes without fabricating a summary', () => {
  const prepared = prepareAssessment({ kind: 'classic' }, limits)
  const exhausted = createWorkBudget(0)
  const stepLimited = prepareAssessment({ kind: 'classic' }, { ...limits, maxSteps: 1 })

  expect(prepared.screen([], createWorkBudget(10)).status).toBe('invalid')
  expect(prepared.screen(uniqueBoard, { limit: 10, used: 11 }).status).toBe('invalid')
  expect(prepared.screen(uniqueBoard, exhausted)).toMatchObject({ status: 'budget-exhausted' })
  expect(exhausted.used).toBe(0)
  expect(stepLimited.screen(uniqueBoard, createWorkBudget(limits.maxWork))).toMatchObject({
    status: 'budget-exhausted',
    stage: 'logic',
    difficulty: 'easy',
  })
})
