import { expect, it } from 'vitest'
import { createAssessmentInput, parseAssessmentInput } from '@/core/sudoku/rating/input'
import { uniqueBoard } from '../../../../tests/fixtures/sudoku'

it.each([
  { board: [0] },
  { rules: { kind: 'unknown' } },
  { ratingVersion: 'unknown' },
  { limits: { maxSteps: -1, maxWork: 1 } },
  { limits: { maxSteps: 500.5, maxWork: 1 } },
  { limits: { maxSteps: 501, maxWork: 1 } },
  { limits: { maxSteps: 500, maxWork: Infinity } },
])('rejects malformed assessment input %j', (change) => {
  expect(
    parseAssessmentInput({ ...createAssessmentInput(uniqueBoard, { kind: 'classic' }), ...change })
      .valid,
  ).toBe(false)
})
