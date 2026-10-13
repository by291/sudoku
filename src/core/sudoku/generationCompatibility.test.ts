import { describe, expect, it } from 'vitest'
import baseline from '../../../tests/fixtures/generationCompatibility.json'
import {
  generatePuzzle,
  parseGenerationInput,
  parsePuzzle,
  DEFAULT_GENERATION_LIMITS,
} from '@/core/sudoku/generation'
import type { GenerationInput, GenerationLimits, GenerationResult } from '@/core/sudoku/generation'
import { isRecord } from '@/core/sudoku/types'

type CompatibilityCase = {
  input: GenerationInput
  limits: GenerationLimits
  expected: GenerationResult
}

function decodeCase(value: unknown): CompatibilityCase {
  if (!isRecord(value) || !isRecord(value.expected)) {
    throw new TypeError('Invalid compatibility case')
  }

  const input = parseGenerationInput(value.input)
  const puzzle = parsePuzzle(value.expected.puzzle)
  const source = value.expected.source

  if (
    !input.valid ||
    !puzzle.valid ||
    value.expected.status !== 'ready' ||
    (source !== 'generated' && source !== 'fallback')
  ) {
    throw new TypeError('Compatibility baseline must contain valid ready outcomes')
  }

  let limits = DEFAULT_GENERATION_LIMITS

  if (value.limits !== undefined) {
    const raw = value.limits

    if (
      !isRecord(raw) ||
      raw.maxLayouts !== 0 ||
      raw.searchNodes !== 0 ||
      raw.logicalSteps !== 500 ||
      raw.fallbackNodes !== 1000000
    ) {
      throw new TypeError('Invalid forced-fallback compatibility budget')
    }

    limits = { maxLayouts: 0, searchNodes: 0, logicalSteps: 500, fallbackNodes: 1000000 }
  }

  return { input: input.value, limits, expected: { status: 'ready', puzzle: puzzle.value, source } }
}

// These historical outputs freeze versioned identity; independent reference solvers test correctness.
const cases = baseline.map(decodeCase)

describe('versioned generation compatibility', () => {
  it.each(cases)(
    'preserves the frozen versioned generation outcome for $input.variant/$input.difficulty',
    ({ input, limits, expected }) => {
      expect(generatePuzzle(input, limits)).toEqual(expected)
    },
  )
})
