import { expect, it } from 'vitest'
import {
  createGenerationInput,
  generatePuzzle,
  parseGenerationInput,
  parseGenerationLimits,
  PUZZLE_VERSION,
} from '@/core/sudoku/generation'
import { TEMPLATES } from '@/core/sudoku/templates'
import { assessPuzzle, createAssessmentInput } from '@/core/sudoku/rating'
import { analyzeLogic } from '@/core/sudoku/logic'
import { ALL_CLASSIC_TECHNIQUES, TECHNIQUES } from '@/core/sudoku/techniques'
import { countReferenceSolutions } from '../../../tests/support/referenceSudoku'
import { isComplete } from '@/core/sudoku/board'
import type { Difficulty } from '@/core/sudoku/types'
import { countIntercalates } from '../../../tests/support/terminalDiversity'

it.each(TEMPLATES)(
  'verifies the frozen $difficulty template independently',
  ({ givens, solution, difficulty }) => {
    expect(countReferenceSolutions(givens, 2)).toBe(1)
    expect(isComplete(solution)).toBe(true)
    expect(assessPuzzle(createAssessmentInput(givens, { kind: 'classic' }))).toMatchObject({
      status: 'rated',
      summary: { difficulty },
    })
    expect(analyzeLogic(givens, ALL_CLASSIC_TECHNIQUES, 500)).toMatchObject({
      status: 'solved',
      board: solution,
    })
    if (difficulty === 'medium') {
      expect(analyzeLogic(givens, TECHNIQUES.slice(0, 2), 500).status).toBe('stalled')
    }

    if (difficulty === 'hard') {
      expect(analyzeLogic(givens, TECHNIQUES.slice(0, 3), 500).status).toBe('stalled')
    }
  },
)
const tiers: Difficulty[] = ['easy', 'medium', 'hard']
it.each(
  tiers.flatMap((difficulty) =>
    ['generation-01', 'generation-02', 'generation-03'].map((seed) => ({ difficulty, seed })),
  ),
)('generates a unique reproducible $difficulty puzzle for $seed', (input) => {
  const request = createGenerationInput('classic', input.difficulty, input.seed)
  const result = generatePuzzle(request)

  expect(result.status).toBe('ready')
  expect(generatePuzzle(request)).toEqual(result)
  if (result.status !== 'ready') {
    throw new Error('Generation failed')
  }

  expect(countReferenceSolutions(result.puzzle.givens, 2)).toBe(1)
  expect(
    assessPuzzle(createAssessmentInput(result.puzzle.givens, result.puzzle.rules)),
  ).toMatchObject({ status: 'rated', summary: result.assessment })
  expect(isComplete(result.puzzle.solution)).toBe(true)
  expect(
    result.puzzle.givens.every(
      (value, cell) => value === 0 || value === result.puzzle.solution[cell],
    ),
  ).toBe(true)
})
it('falls back deterministically only after verifying its transformed template', () => {
  const input = {
    variant: 'classic',
    seed: 'fallback',
    difficulty: 'hard',
    puzzleVersion: PUZZLE_VERSION,
  } satisfies Parameters<typeof generatePuzzle>[0]
  const limits = { maxLayouts: 0, maxWork: 0, maxSteps: 500, fallbackWork: 1000000 }
  const result = generatePuzzle(input, limits)

  expect(result).toMatchObject({ status: 'ready', source: 'fallback' })
  expect(generatePuzzle(input, limits)).toEqual(result)
  if (result.status === 'ready') {
    expect(countReferenceSolutions(result.puzzle.givens, 2)).toBe(1)
  }

  expect(generatePuzzle(input, { ...limits, fallbackWork: 0 })).toEqual({
    status: 'budget-exhausted',
    stage: 'fallback-validation',
    metrics: { constructionWork: 0, fallbackWork: 0, layouts: 0 },
  })
})

it('uses only current generation versions and returns an accepted assessment', () => {
  const input = createGenerationInput('classic', 'easy', 'current-generation')
  expect(input.puzzleVersion).toBe('sudoku-v3')
  expect(createGenerationInput('arrow', 'easy', 'current-generation').puzzleVersion).toBe(
    'sudoku-variants-v2',
  )
  expect(parseGenerationInput({ ...input, puzzleVersion: 'sudoku-v1' }).valid).toBe(false)
  const result = generatePuzzle(input)

  expect(result).toMatchObject({
    status: 'ready',
    assessment: { variant: 'classic', difficulty: 'easy', ratingVersion: 'sudoku-rating-v2' },
  })
})

it('validates exact current work limits without accepting historical field names', () => {
  const limits = { maxLayouts: 0, maxWork: 0, maxSteps: 500, fallbackWork: 1000000 }

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
})

it('delivers generated puzzles from independently different terminal classes', () => {
  const counts = new Set<number>()
  for (let index = 1; index <= 4; index++) {
    const seed = `classic-v2-corpus-${String(index).padStart(2, '0')}`
    const result = generatePuzzle(createGenerationInput('classic', 'easy', seed))

    expect(result).toMatchObject({ status: 'ready', source: 'generated' })
    if (result.status !== 'ready') {
      throw new Error(seed)
    }
    expect(countReferenceSolutions(result.puzzle.givens, 2)).toBe(1)
    counts.add(countIntercalates(result.puzzle.solution))
  }

  expect(counts.size).toBeGreaterThan(1)
})

it('never delivers a puzzle when fallback assessment cannot finish', () => {
  const input = createGenerationInput('classic', 'hard', 'incomplete-fallback')

  expect(
    generatePuzzle(input, { maxLayouts: 0, maxWork: 0, maxSteps: 0, fallbackWork: 1000000 }),
  ).toMatchObject({ status: 'budget-exhausted', stage: 'fallback-validation' })
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
