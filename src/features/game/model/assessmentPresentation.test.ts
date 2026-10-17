import { expect, it } from 'vitest'
import {
  assessmentIssueMessage,
  toStoredAssessment,
} from '@/features/game/model/assessmentPresentation'
import type { AssessmentIssue } from '@/sudoku/contracts'

const issues: readonly AssessmentIssue[] = [
  { kind: 'message', message: '  original diagnostic  ' },
  {
    kind: 'violation',
    violation: { constraintId: 'row:0', cells: [0, 1], code: { kind: 'duplicate' } },
  },
  {
    kind: 'violation',
    violation: {
      constraintId: 'cage:2',
      cells: [12, 3],
      code: { kind: 'cage-total', index: 2, sum: 11 },
    },
  },
  {
    kind: 'violation',
    violation: {
      constraintId: 'thermo:4',
      cells: [20, 11, 2],
      code: { kind: 'thermo-order', index: 4 },
    },
  },
  {
    kind: 'violation',
    violation: {
      constraintId: 'arrow:6',
      cells: [30, 21, 12],
      code: { kind: 'arrow-total', index: 6 },
    },
  },
]
const messages = [
  '  original diagnostic  ',
  'row:0: 同一行、列、宫、区域、对角线或笼中的数字不能重复。',
  'cage:2: 第3个笼内数字不能重复，总和必须为11。',
  'thermo:4: 第5支温度计的数字必须从圆头开始严格递增。',
  'arrow:6: 第7条箭头上的数字总和必须等于圆圈内数字。',
]

it('renders typed diagnostic facts with the original prefix and passes messages through', () => {
  expect(issues.map(assessmentIssueMessage)).toEqual(messages)
})

it('projects mixed live issues into historical stored strings in order', () => {
  expect(toStoredAssessment({ status: 'invalid', issues })).toEqual({
    status: 'unavailable',
    reason: 'invalid-input',
    issues: messages,
  })
})

it('projects ungraded and incomplete outcomes into their existing unavailable reasons', () => {
  expect(
    toStoredAssessment({
      status: 'ungraded',
      ratingVersion: 'sudoku-rating-v2',
      variant: 'classic',
    }),
  ).toEqual({ status: 'unavailable', reason: 'ungraded', issues: [] })
  expect(
    toStoredAssessment({
      status: 'budget-exhausted',
      ratingVersion: 'sudoku-rating-v2',
      variant: 'classic',
      stage: 'validation',
      difficulty: null,
    }),
  ).toEqual({ status: 'unavailable', reason: 'budget-exhausted', issues: [] })
})
