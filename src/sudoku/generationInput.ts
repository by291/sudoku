import { SEED_BYTE_LENGTH } from '@/sudoku/seed'
import type { Difficulty, SudokuVariant } from '@/sudoku/contracts'
import { PUZZLE_VERSION, VARIANT_PUZZLE_VERSION } from '@/sudoku/guards'
import { isRecord, isDifficulty } from '@/sudoku/values'
import { isSudokuVariant, supportsDifficulty } from '@/sudoku/catalogue'

export type GenerationInput = { seed: Uint8Array; difficulty: Difficulty } & (
  | { variant: 'classic'; puzzleVersion: typeof PUZZLE_VERSION }
  | { variant: Exclude<SudokuVariant, 'classic'>; puzzleVersion: typeof VARIANT_PUZZLE_VERSION }
)

type GenerationIdentity = {
  variant: SudokuVariant
  difficulty: Difficulty
  seed: Uint8Array
  puzzleVersion?: unknown
}

function isGenerationIdentity(value: unknown): value is GenerationIdentity {
  return (
    isRecord(value) &&
    isSudokuVariant(value.variant) &&
    isDifficulty(value.difficulty) &&
    supportsDifficulty(value.variant, value.difficulty) &&
    value.seed instanceof Uint8Array &&
    value.seed.length === SEED_BYTE_LENGTH
  )
}

function ownGenerationInput(identity: GenerationIdentity): GenerationInput {
  const { variant, difficulty, seed } = identity
  const ownedSeed = seed.slice()

  if (variant === 'classic') {
    return {
      variant,
      difficulty,
      seed: ownedSeed,
      puzzleVersion: PUZZLE_VERSION,
    }
  }

  return {
    variant,
    difficulty,
    seed: ownedSeed,
    puzzleVersion: VARIANT_PUZZLE_VERSION,
  }
}

/** Snapshot the mutable seed before the request crosses an asynchronous boundary. */
export function copyGenerationInput(input: GenerationInput): GenerationInput {
  return { ...input, seed: input.seed.slice() }
}

/** Create an owned byte request. Labels, UUIDs and persisted hexadecimal text are not seeds. */
export function createGenerationInput(
  variant: SudokuVariant,
  difficulty: Difficulty,
  seed: Uint8Array,
): GenerationInput {
  const identity = {
    variant,
    difficulty,
    seed,
  }
  if (!isGenerationIdentity(identity)) {
    throw new TypeError('Invalid binary generation input')
  }

  return ownGenerationInput(identity)
}

/** Validate the variant-owned puzzle version before taking a copy of the binary seed. */
export function parseGenerationInput(
  value: unknown,
): { valid: true; value: GenerationInput } | { valid: false; issues: string[] } {
  if (
    !isGenerationIdentity(value) ||
    value.puzzleVersion !== (value.variant === 'classic' ? PUZZLE_VERSION : VARIANT_PUZZLE_VERSION)
  ) {
    return { valid: false, issues: ['Invalid binary generation input'] }
  }

  return { valid: true, value: ownGenerationInput(value) }
}
