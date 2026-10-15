import type { Difficulty, Board } from '@/core/sudoku/types'
import type { DifficultyAssessment } from '@/core/sudoku/rating/types'
import type { WorkStage, WorkBudget } from '@/core/sudoku/budget'
import type { Puzzle } from '@/core/sudoku/puzzle'
import type { NewSudokuVariant, SudokuVariant, RulesFor } from '@/core/sudoku/rules/types'

export const PUZZLE_VERSION = 'sudoku-v10'
export const VARIANT_PUZZLE_VERSION = 'sudoku-variants-v10'

export type GenerationInput = { seed: string; difficulty: Difficulty } & (
  | { variant: 'classic'; puzzleVersion: typeof PUZZLE_VERSION }
  | { variant: NewSudokuVariant; puzzleVersion: typeof VARIANT_PUZZLE_VERSION }
)

export type GenerationLimits = {
  maxLayouts: number
  maxWork: number
  maxSteps: number
}

export type GenerationMetrics = {
  constructionWork: number
  layouts: number
  completedLayouts: number
  candidateVisits: number
  workByStage: Record<WorkStage, number>
}

export type GenerationExhaustionCause =
  'work-limit' | 'logical-step-limit' | 'layout-limit' | 'exhausted-frontier'

export type GenerationAttemptResult =
  | {
      status: 'ready'
      puzzle: Puzzle
      source: 'generated'
      assessment: DifficultyAssessment
    }
  | { status: 'budget-exhausted'; stage: 'construction'; cause: GenerationExhaustionCause }
  | { status: 'failed'; reason: string }

export type GenerationResult = GenerationAttemptResult & { metrics: Readonly<GenerationMetrics> }

/** Arithmetic variants restrict digit/complement transforms to preserve clue equations. */
export type VariantGenerationStrategy<K extends NewSudokuVariant> = {
  readonly allowsDigitMap: boolean
  readonly allowsComplement: boolean
  createGeometry(
    rules: RulesFor<K>,
    solution: Board,
    random: () => number,
    budget: WorkBudget,
  ): RulesFor<K> | null
  transformRules(
    rules: RulesFor<K>,
    cellMap: (cell: number) => number,
    complement: boolean,
  ): RulesFor<K>
}

export type LayoutRandomStreams = { terminal: () => number; geometry: () => number }

export type LayoutConstructionResult<K extends SudokuVariant = SudokuVariant> =
  | { status: 'ready'; terminal: Board; rules: RulesFor<K> }
  | { status: 'budget-exhausted' }
  | { status: 'attempt-exhausted' }
  | { status: 'failed'; reason: string }

export type GenerationStrategy<K extends SudokuVariant> = {
  readonly allowsDigitMap: boolean
  readonly allowsComplement: boolean
  construct(
    difficulty: Difficulty,
    random: LayoutRandomStreams,
    budget: WorkBudget,
  ): LayoutConstructionResult<K>
}
