import { expect, it } from 'vitest'
import { generationInput } from './support/generation'
import { DEFAULT_GENERATION_LIMITS, generatePuzzle } from './support/engine'

it.each([
  { name: 'layout', limits: { ...DEFAULT_GENERATION_LIMITS, maxLayouts: 0 } },
  { name: 'work', limits: { ...DEFAULT_GENERATION_LIMITS, maxWork: 1 } },
  { name: 'logical step', limits: { ...DEFAULT_GENERATION_LIMITS, maxLayouts: 1, maxSteps: 0 } },
])('transports explicit exhaustion at the $name boundary', ({ limits }) => {
  const result = generatePuzzle(generationInput('killer', 'hard', 'wasm-boundary'), limits)

  expect(result).toMatchObject({ status: 'budget-exhausted', stage: 'construction' })
  expect(result).not.toHaveProperty('puzzle')
  expect(result).not.toHaveProperty('assessment')
  expect(result.metrics.constructionWork).toBeLessThanOrEqual(limits.maxWork)
  expect(result.metrics.layouts).toBeLessThanOrEqual(limits.maxLayouts)
})
