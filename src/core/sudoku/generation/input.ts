import type { Difficulty, ParseResult } from '@/core/sudoku/types'
import { isDifficulty, isRecord } from '@/core/sudoku/types'
import { isSudokuVariant } from '@/core/sudoku/rules/context'
import type { SudokuVariant } from '@/core/sudoku/rules/types'
import { supportsDifficulty } from '@/core/sudoku/difficulties'
import { PUZZLE_VERSION, VARIANT_PUZZLE_VERSION } from '@/core/sudoku/generation/types'
import type { GenerationInput, GenerationLimits } from '@/core/sudoku/generation/types'

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
