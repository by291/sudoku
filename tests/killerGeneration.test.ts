// @vitest-environment node
import { expect, it } from 'vitest'
import {
  createGenerationInput,
  generatePuzzle,
  DEFAULT_GENERATION_LIMITS,
} from '@/core/sudoku/generation'
import { KILLER_HARD_REGRESSION_SEEDS } from './fixtures/generationCorpus'
import { referenceCountSolutions } from './support/referenceVariants'

it('constructs fresh matching Killer Hard puzzles in the fixed corpus instead of only falling back', () => {
  let constructed = 0
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
    if (result.source === 'generated') {
      constructed++
    }
  }

  expect(constructed).toBeGreaterThan(0)
}, 30000)
