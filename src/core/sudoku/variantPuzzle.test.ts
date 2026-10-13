import { expect, it } from 'vitest'
import { generatePuzzle, parsePuzzle, VARIANT_PUZZLE_VERSION } from '@/core/sudoku/generation'
import { VARIANT_FIXTURES } from '../../../tests/fixtures/variants'
import { referenceCountSolutions } from '../../../tests/support/referenceVariants'
import { compileRules } from '@/core/sudoku/rules'
import { rateVariantDifficulty } from '@/core/sudoku/logic'
import { createWorkBudget } from '@/core/sudoku/budget'
import { variantRulesMatter } from '@/core/sudoku/variantGeneration'

const variants = ['diagonal', 'jigsaw', 'killer', 'thermo', 'arrow'] as const
it.each(
  variants.flatMap((variant) =>
    (['easy', 'medium', 'hard'] as const).map((difficulty) => ({ variant, difficulty })),
  ),
)(
  'generates a reproducible rule-dependent $variant/$difficulty puzzle',
  ({ variant, difficulty }) => {
    const input = {
      variant,
      difficulty,
      puzzleVersion: VARIANT_PUZZLE_VERSION,
      seed: 'variant-release-01',
    } as const
    const result = generatePuzzle(input)

    expect(result.status).toBe('ready')
    expect(generatePuzzle(input)).toEqual(result)
    if (result.status !== 'ready') {
      throw new Error('Expected verified generation')
    }

    const puzzle = result.puzzle

    expect(puzzle.rules.kind).toBe(variant)
    expect(parsePuzzle(puzzle).valid).toBe(true)
    expect(referenceCountSolutions(puzzle.givens, puzzle.rules)).toEqual({
      count: 1,
      solution: puzzle.solution,
    })
    const budget = createWorkBudget(1000000)

    expect(rateVariantDifficulty(puzzle.givens, compileRules(puzzle.rules), 500, budget)).toEqual({
      status: 'rated',
      difficulty,
    })
    expect(variantRulesMatter(puzzle, budget)).toEqual({ status: 'complete', matters: true })
  },
  60000,
)
it('validates fallback independently and never returns an unverified puzzle after exhaustion', () => {
  const input = {
    variant: 'arrow',
    difficulty: 'hard',
    puzzleVersion: VARIANT_PUZZLE_VERSION,
    seed: 'forced-fallback',
  } as const
  const limits = { maxLayouts: 0, searchNodes: 0, logicalSteps: 500, fallbackNodes: 1000000 }

  expect(generatePuzzle(input, limits)).toMatchObject({ status: 'ready', source: 'fallback' })
  expect(generatePuzzle(input, { ...limits, fallbackNodes: 0 })).toEqual({
    status: 'budget-exhausted',
    stage: 'fallback-validation',
  })
})
it('rejects missing rules and solutions that violate their clues', () => {
  const fixture = VARIANT_FIXTURES.thermo
  const metadata = { seed: 'shape', difficulty: 'easy', puzzleVersion: 'sudoku-variants-v1' }

  expect(
    parsePuzzle({ ...metadata, givens: fixture.givens, solution: fixture.solution }).valid,
  ).toBe(false)
  expect(
    parsePuzzle({ ...metadata, ...fixture, rules: { kind: 'thermo', paths: [[1, 0]] } }).valid,
  ).toBe(false)
})
