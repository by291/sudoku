import { RATING_VERSION } from '@/core/sudoku/rating/policies'
import type { Board, ParseResult } from '@/core/sudoku/types'
import { isRecord } from '@/core/sudoku/types'
import type { PuzzleRules } from '@/core/sudoku/rules/types'
import { parseRules } from '@/core/sudoku/rules/context'
import { parseBoard } from '@/core/sudoku/board'
import { DEFAULT_WORK_LIMIT } from '@/core/sudoku/budget'
import type { AssessmentLimits, AssessmentInput } from '@/core/sudoku/rating/types'

export const DEFAULT_ASSESSMENT_LIMITS: Readonly<AssessmentLimits> = {
  maxSteps: 500,
  maxWork: DEFAULT_WORK_LIMIT * 4,
}

export function createAssessmentInput(
  board: Board,
  rules: PuzzleRules,
  limits: AssessmentLimits = DEFAULT_ASSESSMENT_LIMITS,
): AssessmentInput {
  return { board, rules, ratingVersion: RATING_VERSION, limits: { ...limits } }
}

function isWorkLimit(value: unknown, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum
}

export function parseAssessmentLimits(value: unknown): ParseResult<AssessmentLimits> {
  if (
    !isRecord(value) ||
    !isWorkLimit(value.maxSteps, DEFAULT_ASSESSMENT_LIMITS.maxSteps) ||
    !isWorkLimit(value.maxWork, DEFAULT_ASSESSMENT_LIMITS.maxWork)
  ) {
    return { valid: false, issues: ['Invalid assessment work limits'] }
  }

  return { valid: true, value: { maxSteps: value.maxSteps, maxWork: value.maxWork } }
}

export function parseAssessmentInput(value: unknown): ParseResult<AssessmentInput> {
  if (!isRecord(value) || value.ratingVersion !== RATING_VERSION) {
    return { valid: false, issues: ['Invalid assessment envelope or rating version'] }
  }

  const board = parseBoard(value.board)
  const rules = parseRules(value.rules)
  const limits = parseAssessmentLimits(value.limits)
  if (!board.valid) {
    return board
  }
  if (!rules.valid) {
    return rules
  }
  if (!limits.valid) {
    return limits
  }

  return {
    valid: true,
    value: {
      board: board.value,
      rules: rules.value,
      ratingVersion: RATING_VERSION,
      limits: limits.value,
    },
  }
}
