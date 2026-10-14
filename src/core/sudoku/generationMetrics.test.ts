import { expect, it } from 'vitest'
import {
  createGenerationInput,
  generatePuzzle,
  DEFAULT_GENERATION_LIMITS,
} from '@/core/sudoku/generation'

it('reports consumed construction and fallback work without resetting abandoned layouts', () => {
  for (const variant of ['classic', 'diagonal', 'jigsaw', 'killer', 'thermo', 'arrow'] as const) {
    const result = generatePuzzle(createGenerationInput(variant, 'easy', 'work-report'), {
      ...DEFAULT_GENERATION_LIMITS,
      maxWork: 1,
    })
    expect(result).toMatchObject({
      status: 'ready',
      source: 'fallback',
      metrics: { constructionWork: 1, layouts: 1 },
    })
    expect(result.metrics.fallbackWork).toBeGreaterThan(0)
    expect(result.metrics.fallbackWork).toBeLessThanOrEqual(DEFAULT_GENERATION_LIMITS.fallbackWork)
  }
})
