import { expect, it } from 'vitest'
import { createGenerationInput, DEFAULT_GENERATION_LIMITS } from '@/core/sudoku/generation/input'
import { generatePuzzle } from '@/core/sudoku/generation/generate'

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
    expect(result.metrics).toEqual({
      constructionWork: 1,
      layouts: 1,
      completedLayouts: 0,
      candidateVisits: 0,
      workByStage: { preparation: 1, arithmetic: 0, exact: 0, logic: 0, proposals: 0 },
    })
  }
})
