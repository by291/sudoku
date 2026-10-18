// @vitest-environment node
import { expect, it } from 'vitest'
import { generationInput } from './support/generation'
import { generatePuzzle } from './support/engine'
import { referenceCountSolutions } from './support/referenceVariants'

// Original difficulty-guided regression inputs retain their independently derived v11 seeds.
it.each(['local-product-corpus-v1:seed:000', 'local-product-corpus-v1:seed:017'])(
  'independently verifies a difficulty-guided Killer Hard solution for %s',
  (seed) => {
    const result = generatePuzzle(generationInput('killer', 'hard', seed))

    expect(result).toMatchObject({ status: 'ready', source: 'generated' })
    if (result.status !== 'ready') {
      throw new Error('Missing difficulty-guided puzzle')
    }
    expect(referenceCountSolutions(result.puzzle.givens, result.puzzle.rules)).toEqual({
      count: 1,
      solution: result.puzzle.solution,
    })
    expect(result.assessment.difficulty).toBe('hard')
  },
  30000,
)
