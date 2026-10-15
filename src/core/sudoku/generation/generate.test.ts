import { expect, it } from 'vitest'
import {
  createGenerationInput,
  parseGenerationInput,
  DEFAULT_GENERATION_LIMITS,
} from '@/core/sudoku/generation/input'
import { generatePuzzle } from '@/core/sudoku/generation/generate'
import { PUZZLE_VERSION } from '@/core/sudoku/generation/types'
import { CLASSIC_PUZZLE_FIXTURES } from '../../../../tests/fixtures/classicPuzzles'
import { assessPuzzle, createAssessmentInput } from '@/core/sudoku/rating'
import { analyzeLogic } from '@/core/sudoku/logic'
import { ALL_CLASSIC_TECHNIQUES, TECHNIQUES } from '@/core/sudoku/techniques'
import { countReferenceSolutions } from '../../../../tests/support/referenceSudoku'
import { isComplete } from '@/core/sudoku/board'
import type { Difficulty } from '@/core/sudoku/types'
import { countIntercalates } from '../../../../tests/support/terminalDiversity'

it.each(CLASSIC_PUZZLE_FIXTURES)(
  'verifies the authored $difficulty fixture independently',
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

it('returns reproducible construction exhaustion without substituting an authored puzzle', () => {
  const input = {
    variant: 'classic',
    seed: 'exhausted',
    difficulty: 'hard',
    puzzleVersion: PUZZLE_VERSION,
  } satisfies Parameters<typeof generatePuzzle>[0]
  const limits = { maxLayouts: 0, maxWork: 0, maxSteps: 500 }
  const result = generatePuzzle(input, limits)

  expect(result).toEqual({
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
  expect(generatePuzzle(input, limits)).toEqual(result)
})

it('uses only current generation versions and returns an accepted assessment', () => {
  const input = createGenerationInput('classic', 'easy', 'current-generation')
  expect(input.puzzleVersion).toBe('sudoku-v10')
  for (const variant of ['diagonal', 'jigsaw', 'killer', 'thermo', 'arrow'] as const) {
    expect(createGenerationInput(variant, 'easy', 'current-generation').puzzleVersion).toBe(
      'sudoku-variants-v10',
    )
  }
  const killerInput = createGenerationInput('killer', 'hard', 'current-generation')

  expect(killerInput.puzzleVersion).toBe('sudoku-variants-v10')
  expect(parseGenerationInput(killerInput)).toEqual({ valid: true, value: killerInput })
  expect(parseGenerationInput({ ...killerInput, puzzleVersion: 'sudoku-variants-v6' }).valid).toBe(
    false,
  )
  expect(parseGenerationInput({ ...input, puzzleVersion: 'sudoku-v1' }).valid).toBe(false)
  const result = generatePuzzle(input)

  expect(result).toMatchObject({
    status: 'ready',
    assessment: { variant: 'classic', difficulty: 'easy', ratingVersion: 'sudoku-rating-v2' },
  })
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

it('never delivers a puzzle when construction assessment cannot finish', () => {
  const input = createGenerationInput('classic', 'hard', 'incomplete-assessment')

  expect(
    generatePuzzle(input, { ...DEFAULT_GENERATION_LIMITS, maxLayouts: 1, maxSteps: 0 }),
  ).toMatchObject({ status: 'budget-exhausted', stage: 'construction' })
})
