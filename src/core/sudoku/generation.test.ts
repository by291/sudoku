import { expect, it } from 'vitest'
import { generatePuzzle, PUZZLE_VERSION } from '@/core/sudoku/generation'
import { TEMPLATES } from '@/core/sudoku/templates'
import { rateDifficulty, analyzeLogic } from '@/core/sudoku/logic'
import { TECHNIQUES } from '@/core/sudoku/techniques'
import { countReferenceSolutions } from '../../../tests/support/referenceSudoku'
import { isComplete } from '@/core/sudoku/board'
import type { Difficulty } from '@/core/sudoku/types'

it.each(TEMPLATES)(
  'verifies the frozen $difficulty template independently',
  ({ givens, solution, difficulty }) => {
    expect(countReferenceSolutions(givens, 2)).toBe(1)
    expect(isComplete(solution)).toBe(true)
    expect(rateDifficulty(givens, 500)).toBe(difficulty)
    expect(analyzeLogic(givens, TECHNIQUES, 500)).toMatchObject({
      status: 'solved',
      board: solution,
    })
    if (difficulty === 'medium')
      expect(analyzeLogic(givens, TECHNIQUES.slice(0, 2), 500).status).toBe('stalled')
    if (difficulty === 'hard')
      expect(analyzeLogic(givens, TECHNIQUES.slice(0, 3), 500).status).toBe('stalled')
  },
)
const tiers: Difficulty[] = ['easy', 'medium', 'hard']
it.each(
  tiers.flatMap((difficulty) =>
    ['generation-01', 'generation-02', 'generation-03'].map((seed) => ({ difficulty, seed })),
  ),
)('generates a unique reproducible $difficulty puzzle for $seed', (input) => {
  const request = { ...input, puzzleVersion: PUZZLE_VERSION }
  const result = generatePuzzle(request)
  expect(result.status).toBe('ready')
  expect(generatePuzzle(request)).toEqual(result)
  if (result.status !== 'ready') throw new Error('Generation failed')
  expect(countReferenceSolutions(result.puzzle.givens, 2)).toBe(1)
  expect(rateDifficulty(result.puzzle.givens, 500)).toBe(input.difficulty)
  expect(isComplete(result.puzzle.solution)).toBe(true)
  expect(
    result.puzzle.givens.every(
      (value, cell) => value === 0 || value === result.puzzle.solution[cell],
    ),
  ).toBe(true)
})
it('falls back deterministically only after verifying its transformed template', () => {
  const input = {
    seed: 'fallback',
    difficulty: 'hard',
    puzzleVersion: PUZZLE_VERSION,
  } satisfies Parameters<typeof generatePuzzle>[0]
  const limits = { maxLayouts: 0, searchNodes: 0, logicalSteps: 500, fallbackNodes: 1000000 }
  const result = generatePuzzle(input, limits)
  expect(result).toMatchObject({ status: 'ready', source: 'fallback' })
  expect(generatePuzzle(input, limits)).toEqual(result)
  if (result.status === 'ready') expect(countReferenceSolutions(result.puzzle.givens, 2)).toBe(1)
  expect(generatePuzzle(input, { ...limits, fallbackNodes: 0 })).toEqual({
    status: 'budget-exhausted',
    stage: 'fallback-validation',
  })
})
it('rejects unsupported generation versions rather than silently changing the rules', () => {
  expect(generatePuzzle({ seed: 'a', difficulty: 'easy', puzzleVersion: 'unknown' }).status).toBe(
    'failed',
  )
})
