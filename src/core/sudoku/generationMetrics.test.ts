import { expect, it } from 'vitest'
import {
  createGenerationInput,
  generatePuzzle,
  DEFAULT_GENERATION_LIMITS,
} from '@/core/sudoku/generation'

it('reports consumed construction work without resetting abandoned layouts or substituting a puzzle', () => {
  for (const variant of ['classic', 'diagonal', 'jigsaw', 'killer', 'thermo', 'arrow'] as const) {
    const result = generatePuzzle(createGenerationInput(variant, 'easy', 'work-report'), {
      ...DEFAULT_GENERATION_LIMITS,
      maxWork: 1,
    })
    expect(result).toMatchObject({
      status: 'budget-exhausted',
      stage: 'construction',
      metrics: { constructionWork: 1, layouts: 1 },
    })
    expect(result.metrics).toEqual({ constructionWork: 1, layouts: 1 })
  }
})
