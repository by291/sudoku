// @vitest-environment node
import { expect, it } from 'vitest'
import { createGenerationInput, DEFAULT_GENERATION_LIMITS } from '@/core/sudoku/generation/input'
import { generatePuzzle } from '@/core/sudoku/generation/generate'
import { KILLER_HARD_REGRESSION_SEEDS } from './fixtures/generationCorpus'
import { referenceCountSolutions } from './support/referenceVariants'

it('constructs fresh matching Killer Hard puzzles across the fixed regression seeds', () => {
  for (const seed of KILLER_HARD_REGRESSION_SEEDS) {
    const result = generatePuzzle(createGenerationInput('killer', 'hard', seed))
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') {
      throw new Error('Missing Killer Hard puzzle')
    }
    expect(result.assessment.difficulty).toBe('hard')
    expect(result.metrics.constructionWork).toBeLessThanOrEqual(DEFAULT_GENERATION_LIMITS.maxWork)
    expect(referenceCountSolutions(result.puzzle.givens, result.puzzle.rules)).toEqual({
      count: 1,
      solution: result.puzzle.solution,
    })
    expect(result.source).toBe('generated')
  }
}, 30000)

it.each([KILLER_HARD_REGRESSION_SEEDS[0], KILLER_HARD_REGRESSION_SEEDS[2]])(
  'constructs a fresh difficulty-guided Hard puzzle for %s',
  (seed) => {
    const result = generatePuzzle(createGenerationInput('killer', 'hard', seed))

    expect(result).toMatchObject({ status: 'ready', source: 'generated' })
    if (result.status !== 'ready') {
      throw new Error('Missing difficulty-guided puzzle')
    }
    expect(referenceCountSolutions(result.puzzle.givens, result.puzzle.rules)).toEqual({
      count: 1,
      solution: result.puzzle.solution,
    })
    expect(result.assessment.difficulty).toBe('hard')
    expect(result.metrics.constructionWork).toBeLessThanOrEqual(DEFAULT_GENERATION_LIMITS.maxWork)
  },
)
