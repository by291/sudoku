import { expect, it } from 'vitest'
import { generatePuzzle } from '@/core/sudoku/generation/generate'
import { parsePuzzle } from '@/core/sudoku/puzzle'
import { VARIANT_PUZZLE_VERSION } from '@/core/sudoku/generation/types'
import { VARIANT_FIXTURES } from '../../../tests/fixtures/variants'
import { referenceCountSolutions } from '../../../tests/support/referenceVariants'
import { assessPuzzle } from '@/core/sudoku/rating/assessment'
import { createAssessmentInput } from '@/core/sudoku/rating/input'
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

    expect(assessPuzzle(createAssessmentInput(puzzle.givens, puzzle.rules))).toMatchObject({
      status: 'rated',
      summary: result.assessment,
    })
    expect(variantRulesMatter(puzzle, budget)).toEqual({ status: 'complete', matters: true })
  },
  60000,
)
it('returns construction exhaustion without substituting an authored variant puzzle', () => {
  const input = {
    variant: 'arrow',
    difficulty: 'hard',
    puzzleVersion: VARIANT_PUZZLE_VERSION,
    seed: 'forced-exhaustion',
  } as const
  const limits = { maxLayouts: 0, maxWork: 0, maxSteps: 500 }

  expect(generatePuzzle(input, limits)).toEqual({
    status: 'budget-exhausted',
    stage: 'construction',
    cause: 'work-limit',
    metrics: {
      constructionWork: 0,
      layouts: 0,
      completedLayouts: 0,
      candidateVisits: 0,
      workByStage: { preparation: 0, arithmetic: 0, exact: 0, logic: 0, proposals: 0 },
    },
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
