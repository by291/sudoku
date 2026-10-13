import type { Board, Difficulty } from '@/core/sudoku/types'
import type { DifficultyAssessment } from '@/core/sudoku/rating'
import { generateClassicPuzzle } from '@/core/sudoku/classicGeneration'
import { parseBoard, isComplete } from '@/core/sudoku/board'
import { isDifficulty, isRecord } from '@/core/sudoku/types'
import type { ParseResult } from '@/core/sudoku/types'
import { compileRules, isSudokuVariant, parseRules } from '@/core/sudoku/rules'
import type { NewSudokuVariant, PuzzleRules, SudokuVariant } from '@/core/sudoku/rules'
import { generateVariantPuzzle } from '@/core/sudoku/variantGeneration'

export const PUZZLE_VERSION = 'sudoku-v2'
export const VARIANT_PUZZLE_VERSION = 'sudoku-variants-v2'

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

  const parsed = createGenerationInput(value.variant, value.difficulty, value.seed)

  return parsed.puzzleVersion === value.puzzleVersion
    ? { valid: true, value: parsed }
    : { valid: false, issues: ['Unsupported generation version for this type'] }
}

export type GenerationLimits = {
  maxLayouts: number
  maxWork: number
  maxSteps: number
  fallbackWork: number
}

export type GenerationResult =
  | {
      status: 'ready'
      puzzle: Puzzle
      source: 'generated' | 'fallback'
      assessment: DifficultyAssessment
    }
  | { status: 'budget-exhausted'; stage: 'fallback-validation' }
  | { status: 'failed'; reason: string }

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
  maxLayouts: 20,
  maxWork: 1000000,
  maxSteps: 500,
  fallbackWork: 1000000,
}

export function parseGenerationLimits(value: unknown): ParseResult<GenerationLimits> {
  if (!isRecord(value) || Object.keys(value).length !== 4) {
    return { valid: false, issues: ['Generation limits require exactly four known fields'] }
  }

  const limits = { ...DEFAULT_GENERATION_LIMITS }
  for (const key of ['maxLayouts', 'maxWork', 'maxSteps', 'fallbackWork'] as const) {
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
  const parsed = parseGenerationInput(input)
  const parsedLimits = parseGenerationLimits(limits)
  if (!parsed.valid) {
    return { status: 'failed', reason: parsed.issues.join('; ') }
  }
  if (!parsedLimits.valid) {
    return { status: 'failed', reason: parsedLimits.issues.join('; ') }
  }

  if (parsed.value.variant === 'classic') {
    return generateClassicPuzzle(parsed.value, parsedLimits.value)
  }
  return generateVariantPuzzle(parsed.value, parsedLimits.value)
}
