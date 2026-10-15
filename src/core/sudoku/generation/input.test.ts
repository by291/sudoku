import { expect, it } from 'vitest'
import {
  parseGenerationInput,
  parseGenerationLimits,
  DEFAULT_GENERATION_LIMITS,
} from '@/core/sudoku/generation/input'

it('validates exact current work limits without accepting historical field names', () => {
  const limits = { maxLayouts: 0, maxWork: 0, maxSteps: 500 }

  expect(parseGenerationLimits(limits)).toEqual({ valid: true, value: limits })
  expect(parseGenerationLimits({ ...limits, maxWork: Infinity }).valid).toBe(false)
  expect(parseGenerationLimits({ ...limits, maxSteps: 501 }).valid).toBe(false)
  expect(
    parseGenerationLimits({
      maxLayouts: 0,
      searchNodes: 0,
      logicalSteps: 500,
      fallbackNodes: 1000000,
    }).valid,
  ).toBe(false)
  expect(parseGenerationLimits({ ...limits, extra: 0 }).valid).toBe(false)
  expect(parseGenerationLimits({ ...limits, fallbackWork: 1000000 }).valid).toBe(false)
})

it('uses only construction limits for every type and retains the logical step ceiling', () => {
  expect(DEFAULT_GENERATION_LIMITS).toEqual({
    maxLayouts: 40,
    maxWork: 4000000,
    maxSteps: 500,
  })
  expect(parseGenerationLimits(DEFAULT_GENERATION_LIMITS).valid).toBe(true)
  expect(parseGenerationLimits({ ...DEFAULT_GENERATION_LIMITS, maxWork: 4000001 }).valid).toBe(
    false,
  )
})

it('rejects unsupported generation versions rather than silently changing the rules', () => {
  expect(
    parseGenerationInput({
      variant: 'classic',
      seed: 'a',
      difficulty: 'easy',
      puzzleVersion: 'unknown',
    }).valid,
  ).toBe(false)
})
