import { expect, it } from 'vitest'
import { CORPUS_COMBINATIONS } from './fixtures/generationCorpus'
import {
  createGenerationInput,
  generatePuzzle,
  DEFAULT_GENERATION_LIMITS,
} from '@/core/sudoku/generation'

const exhaustedLimits = [
  { name: 'layout', limits: { ...DEFAULT_GENERATION_LIMITS, maxLayouts: 0 } },
  { name: 'work', limits: { ...DEFAULT_GENERATION_LIMITS, maxWork: 1 } },
  { name: 'logical step', limits: { ...DEFAULT_GENERATION_LIMITS, maxLayouts: 1, maxSteps: 0 } },
]

it.each(
  CORPUS_COMBINATIONS.flatMap((combination) =>
    exhaustedLimits.map((limit) => ({ ...combination, ...limit })),
  ),
)(
  'returns explicit exhaustion without a replacement puzzle for $variant/$difficulty at the $name limit',
  ({ variant, difficulty, limits }) => {
    const input = createGenerationInput(variant, difficulty, 'no-authored-substitution')
    const result = generatePuzzle(input, limits)

    expect(result).toMatchObject({ status: 'budget-exhausted', stage: 'construction' })
    expect(result).not.toHaveProperty('puzzle')
    expect(result).not.toHaveProperty('assessment')
    expect(result.metrics).not.toHaveProperty('fallbackWork')
    expect(result.metrics.constructionWork).toBeLessThanOrEqual(limits.maxWork)
    expect(result.metrics.layouts).toBeLessThanOrEqual(limits.maxLayouts)
    expect(generatePuzzle(input, limits)).toEqual(result)
  },
  60000,
)
