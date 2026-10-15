import { expect, it } from 'vitest'
import { supportedDifficulties, supportsDifficulty } from '@/core/sudoku/difficulties'
import { createGenerationInput, parseGenerationInput } from '@/core/sudoku/generation/input'
import { parsePuzzle } from '@/core/sudoku/puzzle'
import { PUZZLE_VERSION, VARIANT_PUZZLE_VERSION } from '@/core/sudoku/generation/types'
import { CLASSIC_PUZZLE_FIXTURES } from '../../../tests/fixtures/classicPuzzles'
import { VARIANT_TEMPLATES } from '@/core/sudoku/variantTemplates'
import { parseAssessmentOutcome } from '@/core/sudoku/rating'
import { RATING_VERSION } from '@/core/sudoku/ratingPolicies'

it('offers nineteen supported type and tier combinations', () => {
  expect(supportedDifficulties('classic')).toEqual(['easy', 'medium', 'hard', 'expert'])
  for (const variant of ['diagonal', 'jigsaw', 'killer', 'thermo', 'arrow'] as const) {
    expect(supportedDifficulties(variant)).toEqual(['easy', 'medium', 'hard'])
    expect(supportsDifficulty(variant, 'expert')).toBe(false)
    expect(
      parseGenerationInput({
        variant,
        difficulty: 'expert',
        seed: 'test',
        puzzleVersion: VARIANT_PUZZLE_VERSION,
      }).valid,
    ).toBe(false)
    expect(() => createGenerationInput(variant, 'expert', 'test')).toThrow(/Expert|difficulty/i)
    expect(
      parsePuzzle({
        ...VARIANT_TEMPLATES[variant].easy[0],
        difficulty: 'expert',
        seed: 'stored',
        puzzleVersion: 'old',
      }).valid,
    ).toBe(false)
    expect(
      parseAssessmentOutcome({
        status: 'budget-exhausted',
        ratingVersion: RATING_VERSION,
        variant,
        stage: 'logic',
        difficulty: 'expert',
      }).valid,
    ).toBe(false)
  }
})

it('accepts Classic Expert without interpreting a stored board as a generation request', () => {
  expect(
    parseGenerationInput({
      variant: 'classic',
      difficulty: 'expert',
      seed: 'test',
      puzzleVersion: PUZZLE_VERSION,
    }).valid,
  ).toBe(true)
  const template = CLASSIC_PUZZLE_FIXTURES[0]
  expect(
    parsePuzzle({
      ...template,
      difficulty: 'expert',
      rules: { kind: 'classic' },
      seed: 'old',
      puzzleVersion: 'saved-version',
    }).valid,
  ).toBe(true)
  expect(
    parsePuzzle({
      ...template,
      difficulty: 'expert',
      rules: { kind: 'diagonal' },
      seed: 'old',
      puzzleVersion: 'saved-version',
    }).valid,
  ).toBe(false)
})
