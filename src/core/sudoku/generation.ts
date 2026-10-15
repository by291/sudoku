import type { Board, Difficulty } from '@/core/sudoku/types'
import type { DifficultyAssessment } from '@/core/sudoku/rating'
import { searchGeneration } from '@/core/sudoku/generationSearch'
import type { WorkStage } from '@/core/sudoku/budget'
import { parseBoard, isComplete } from '@/core/sudoku/board'
import { isDifficulty, isRecord } from '@/core/sudoku/types'
import type { ParseResult } from '@/core/sudoku/types'
import { compileRules, isSudokuVariant, parseRules } from '@/core/sudoku/rules'
import type { NewSudokuVariant, PuzzleRules, SudokuVariant } from '@/core/sudoku/rules'
import { supportsDifficulty } from '@/core/sudoku/difficulties'

export const PUZZLE_VERSION = 'sudoku-v9'
export const VARIANT_PUZZLE_VERSION = 'sudoku-variants-v9'

export type Puzzle = {
  givens: Board
  solution: Board
  difficulty: Difficulty
  seed: string
  puzzleVersion: string
  rules: PuzzleRules
}

export type GenerationInput = { seed: string; difficulty: Difficulty } & (
  | { variant: 'classic'; puzzleVersion: typeof PUZZLE_VERSION }
  | { variant: NewSudokuVariant; puzzleVersion: typeof VARIANT_PUZZLE_VERSION }
)

export function createGenerationInput(
  variant: SudokuVariant,
  difficulty: Difficulty,
  seed: string,
): GenerationInput {
  if (!supportsDifficulty(variant, difficulty)) {
    throw new TypeError('Expert difficulty is supported only for Classic')
  }
  return variant === 'classic'
    ? { variant, difficulty, seed, puzzleVersion: PUZZLE_VERSION }
    : { variant, difficulty, seed, puzzleVersion: VARIANT_PUZZLE_VERSION }
}

export function parseGenerationInput(value: unknown): ParseResult<GenerationInput> {
  if (
    !isRecord(value) ||
    !isDifficulty(value.difficulty) ||
    typeof value.seed !== 'string' ||
    !value.seed ||
    !isSudokuVariant(value.variant)
  ) {
    return { valid: false, issues: ['Invalid generation input'] }
  }

  if (!supportsDifficulty(value.variant, value.difficulty)) {
    return {
      valid: false,
      issues: ['Expert is available only for Classic. Choose Classic or Easy, Medium, or Hard.'],
    }
  }

  const parsed = createGenerationInput(value.variant, value.difficulty, value.seed)

  return parsed.puzzleVersion === value.puzzleVersion
    ? { valid: true, value: parsed }
    : { valid: false, issues: ['Unsupported generation version for this type'] }
}

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

export function parsePuzzle(value: unknown): ParseResult<Puzzle> {
  if (
    !isRecord(value) ||
    !isDifficulty(value.difficulty) ||
    typeof value.seed !== 'string' ||
    !value.seed ||
    typeof value.puzzleVersion !== 'string' ||
    !value.puzzleVersion
  ) {
    return { valid: false, issues: ['Invalid puzzle metadata'] }
  }

  const givens = parseBoard(value.givens)
  const solution = parseBoard(value.solution)
  const rules = parseRules(value.rules)
  if (!givens.valid || !solution.valid || !rules.valid) {
    return { valid: false, issues: ['Invalid puzzle board or rules'] }
  }

  if (!supportsDifficulty(rules.value.kind, value.difficulty)) {
    return { valid: false, issues: ['Expert difficulty is supported only for Classic'] }
  }

  if (
    !isComplete(solution.value, compileRules(rules.value)) ||
    givens.value.some((digit, cell) => digit !== 0 && digit !== solution.value[cell])
  ) {
    return { valid: false, issues: ['Solution does not satisfy puzzle givens'] }
  }

  return {
    valid: true,
    value: {
      givens: givens.value,
      solution: solution.value,
      difficulty: value.difficulty,
      seed: value.seed,
      puzzleVersion: value.puzzleVersion,
      rules: rules.value,
    },
  }
}

export const DEFAULT_GENERATION_LIMITS: GenerationLimits = {
  maxLayouts: 40,
  maxWork: 4000000,
  maxSteps: 500,
}

export function parseGenerationLimits(value: unknown): ParseResult<GenerationLimits> {
  if (!isRecord(value) || Object.keys(value).length !== 3) {
    return { valid: false, issues: ['Generation limits require exactly three known fields'] }
  }

  const limits = { ...DEFAULT_GENERATION_LIMITS }
  for (const key of ['maxLayouts', 'maxWork', 'maxSteps'] as const) {
    const limit = value[key]
    if (
      typeof limit !== 'number' ||
      !Number.isSafeInteger(limit) ||
      limit < 0 ||
      limit > DEFAULT_GENERATION_LIMITS[key]
    ) {
      return { valid: false, issues: [`Invalid generation limit: ${key}`] }
    }
    limits[key] = limit
  }

  return { valid: true, value: limits }
}

export function generatePuzzle(
  input: GenerationInput,
  limits = DEFAULT_GENERATION_LIMITS,
): GenerationResult {
  const metrics: GenerationMetrics = {
    constructionWork: 0,
    layouts: 0,
    completedLayouts: 0,
    candidateVisits: 0,
    workByStage: { preparation: 0, arithmetic: 0, exact: 0, logic: 0, proposals: 0 },
  }
  const parsed = parseGenerationInput(input)
  const parsedLimits = parseGenerationLimits(limits)
  if (!parsed.valid) {
    return { status: 'failed', reason: parsed.issues.join('; '), metrics }
  }
  if (!parsedLimits.valid) {
    return { status: 'failed', reason: parsedLimits.issues.join('; '), metrics }
  }

  return { ...searchGeneration(parsed.value, parsedLimits.value, metrics), metrics }
}
