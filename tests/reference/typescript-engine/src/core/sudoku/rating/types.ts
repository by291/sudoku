import type { LogicalStep, Technique } from '@/core/sudoku/logic/types'
import type { RatingVersion } from '@/core/sudoku/rating/policies'
import type { Board, Difficulty } from '@/core/sudoku/types'
import type { PuzzleRules, SudokuVariant } from '@/core/sudoku/rules/types'
import type { WorkBudget } from '@/core/sudoku/budget'

export type AssessmentLimits = { maxSteps: number; maxWork: number }

export type AssessmentInput = {
  board: Board
  rules: PuzzleRules
  ratingVersion: RatingVersion
  limits: AssessmentLimits
}

export type ReasoningWorkload = {
  steps: number
  placements: number
  eliminations: number
  candidateRemovals: number
  techniqueCounts: Readonly<Record<Technique, number>>
  highestTier: Difficulty | null
  highestTechnique: Technique | null
  variantSteps: number
}

export type DifficultyAssessment = {
  ratingVersion: RatingVersion
  variant: SudokuVariant
  difficulty: Difficulty
  workload: ReasoningWorkload
}

export type AssessmentOutcome =
  | { status: 'rated'; summary: DifficultyAssessment }
  | { status: 'ungraded'; ratingVersion: RatingVersion; variant: SudokuVariant }
  | {
      status: 'budget-exhausted'
      ratingVersion: RatingVersion
      variant: SudokuVariant
      stage: 'validation' | 'logic'
      difficulty: Difficulty | null
    }
  | { status: 'invalid'; issues: readonly string[] }

export type AssessmentResult =
  | { status: 'rated'; summary: DifficultyAssessment; trace: readonly LogicalStep[] }
  | Exclude<AssessmentOutcome, { status: 'rated' }>

export type RatedAssessmentResult = Extract<AssessmentResult, { status: 'rated' }>

/**
 * A rated trial owns its board and successful trace. Completion replays that trace to
 * produce full statistics without another policy search or additional charged work.
 * Changing any clue requires a new trial; candidate domains never cross boards.
 */
export type TrialAssessmentResult =
  | { status: 'rated'; difficulty: Difficulty; complete(): RatedAssessmentResult }
  | Exclude<AssessmentOutcome, { status: 'rated' }>

export type TargetFeedback = { remainingCells: number; deductions: number }

type CompletedTargetTrial = {
  difficulty: Difficulty
  feedback: TargetFeedback
  complete(): RatedAssessmentResult
}

export type TargetScreenResult =
  | ({ status: 'below-target' } & CompletedTargetTrial)
  | ({ status: 'matching-target' } & CompletedTargetTrial)
  | { status: 'target-stalled'; feedback: TargetFeedback }
  | { status: 'budget-exhausted'; cause: 'work-limit' | 'logical-step-limit' }
  | { status: 'invalid'; issues: readonly string[] }

export type PreparedAssessment = {
  screenTarget(board: Board, target: Difficulty, budget: WorkBudget): TargetScreenResult
  assess(board: Board, budget: WorkBudget): AssessmentResult
  screen(board: Board, budget: WorkBudget): TrialAssessmentResult
}

export type PuzzleAssessment =
  | { status: 'rated'; summary: DifficultyAssessment }
  | {
      status: 'unavailable'
      reason:
        | 'ungraded'
        | 'budget-exhausted'
        | 'invalid-input'
        | 'invalid-summary'
        | 'unsupported-version'
        | 'identity-mismatch'
      issues: readonly string[]
    }

export type AssessmentIdentity = { variant: SudokuVariant; difficulty: Difficulty }
