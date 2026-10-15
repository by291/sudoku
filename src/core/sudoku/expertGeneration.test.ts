import { expect, it } from 'vitest'
import { createWorkBudget } from '@/core/sudoku/budget'
import { refineExpertClues } from '@/core/sudoku/expertGeneration'
import { seededRandom } from '@/core/sudoku/random'
import { prepareAssessment } from '@/core/sudoku/rating'
import { CLASSIC_PUZZLE_FIXTURES } from '../../../tests/fixtures/classicPuzzles'

const hard = CLASSIC_PUZZLE_FIXTURES.find((fixture) => fixture.difficulty === 'hard')
if (!hard) {
  throw new Error('Missing independently verified Hard fixture')
}
const checkpoint = { givens: hard.givens, clues: hard.givens.filter(Boolean).length }

it.each([0, 1, 20])('discards incomplete Expert refinement when shared work is %i', (limit) => {
  const budget = createWorkBudget(limit)
  const original = [...checkpoint.givens]

  const result = refineExpertClues(
    hard.solution,
    checkpoint,
    prepareAssessment({ kind: 'classic' }),
    seededRandom('bounded-expert-refinement'),
    budget,
    28,
  )

  expect(result).toEqual({ status: 'budget-exhausted', stage: 'construction' })
  expect(budget.used).toBe(limit)
  expect(checkpoint.givens).toEqual(original)
})

it('discards step-limited refinements without mutating the retained Hard checkpoint', () => {
  const original = [...checkpoint.givens]
  const budget = createWorkBudget(4000000)

  const result = refineExpertClues(
    hard.solution,
    checkpoint,
    prepareAssessment({ kind: 'classic' }, { maxSteps: 0, maxWork: budget.limit }),
    seededRandom('ungraded-expert-refinement'),
    budget,
    28,
  )

  expect(result).toEqual({ status: 'budget-exhausted', stage: 'construction' })
  expect(result).not.toHaveProperty('givens')
  expect(result).not.toHaveProperty('assessment')
  expect(checkpoint.givens).toEqual(original)
  expect(budget.used).toBeGreaterThan(0)
  expect(budget.used).toBeLessThanOrEqual(budget.limit)
})
