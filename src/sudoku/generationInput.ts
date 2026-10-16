import { SEED_BYTE_LENGTH } from '@/sudoku/seed'
import type { Difficulty, SudokuVariant } from '@/sudoku/contracts'
import {
  PUZZLE_VERSION,
  VARIANT_PUZZLE_VERSION,
  isRecord,
  isVariant,
  isDifficulty,
} from '@/sudoku/guards'

export type GenerationInput = { seed: Uint8Array; difficulty: Difficulty } & (
  | { variant: 'classic'; puzzleVersion: typeof PUZZLE_VERSION }
  | { variant: Exclude<SudokuVariant, 'classic'>; puzzleVersion: typeof VARIANT_PUZZLE_VERSION }
)

export function copyGenerationInput(input: GenerationInput): GenerationInput {
  return { ...input, seed: input.seed.slice() }
}

/** Create an owned byte request. Labels, UUIDs and persisted hexadecimal text are not seeds. */
export function createGenerationInput(
  variant: SudokuVariant,
  difficulty: Difficulty,
  seed: Uint8Array,
): GenerationInput {
  if (
    !isVariant(variant) ||
    !isDifficulty(difficulty) ||
    !(seed instanceof Uint8Array) ||
    seed.length !== SEED_BYTE_LENGTH ||
    (variant !== 'classic' && difficulty === 'expert')
  ) {
    throw new TypeError('Invalid binary generation input')
  }
  const owned = seed.slice()
  return variant === 'classic'
    ? { variant, difficulty, seed: owned, puzzleVersion: PUZZLE_VERSION }
    : { variant, difficulty, seed: owned, puzzleVersion: VARIANT_PUZZLE_VERSION }
}

export function parseGenerationInput(
  value: unknown,
): { valid: true; value: GenerationInput } | { valid: false; issues: string[] } {
  if (
    !isRecord(value) ||
    !isVariant(value.variant) ||
    !isDifficulty(value.difficulty) ||
    !(value.seed instanceof Uint8Array) ||
    value.seed.length !== SEED_BYTE_LENGTH ||
    (value.variant !== 'classic' && value.difficulty === 'expert') ||
    value.puzzleVersion !== (value.variant === 'classic' ? PUZZLE_VERSION : VARIANT_PUZZLE_VERSION)
  ) {
    return { valid: false, issues: ['Invalid binary generation input'] }
  }
  return { valid: true, value: createGenerationInput(value.variant, value.difficulty, value.seed) }
}
