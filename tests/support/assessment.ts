import type { AssessmentInput, AssessmentLimits, Board, PuzzleRules } from '@/sudoku/contracts'
import { RATING_VERSION } from '@/sudoku/guards'

/** Constructs a Worker request; it does not supply independent rating expectations. */
export function createAssessmentInput(
  board: Board,
  rules: PuzzleRules,
  limits: AssessmentLimits = { maxSteps: 500 },
): AssessmentInput {
  return { board, rules, ratingVersion: RATING_VERSION, limits: { ...limits } }
}
