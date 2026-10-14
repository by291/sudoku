import { expect, it } from 'vitest'
import { CORPUS_COMBINATIONS } from './fixtures/generationCorpus'
import {
  createGenerationInput,
  generatePuzzle,
  DEFAULT_GENERATION_LIMITS,
} from '@/core/sudoku/generation'
import { referenceCountSolutions } from './support/referenceVariants'
import { structureIssues } from './support/variantStructure'

it.each(CORPUS_COMBINATIONS)(
  'verifies forced fallback and exhaustion for $variant/$difficulty',
  ({ variant, difficulty }) => {
    const input = createGenerationInput(variant, difficulty, 'all-fallbacks-current')
    const limits = { ...DEFAULT_GENERATION_LIMITS, maxLayouts: 0, maxWork: 0 }
    const result = generatePuzzle(input, limits)

    expect(result).toMatchObject({
      status: 'ready',
      source: 'fallback',
      assessment: { variant, difficulty },
    })
    if (result.status !== 'ready') {
      throw new Error('Missing verified fallback')
    }
    expect(structureIssues(result.puzzle.solution, result.puzzle.rules)).toEqual([])
    expect(referenceCountSolutions(result.puzzle.givens, result.puzzle.rules)).toEqual({
      count: 1,
      solution: result.puzzle.solution,
    })
    expect(generatePuzzle(input, { ...limits, fallbackWork: 0 })).toMatchObject({
      status: 'budget-exhausted',
      stage: 'fallback-validation',
    })
  },
)
