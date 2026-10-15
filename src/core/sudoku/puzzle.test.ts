import { expect, it } from 'vitest'
import { createGenerationInput, parseGenerationInput } from '@/core/sudoku/generation/input'
import { parsePuzzle } from '@/core/sudoku/puzzle'
import { CLASSIC_PUZZLE_FIXTURES } from '../../../tests/fixtures/classicPuzzles'

it('retains valid v7 saved puzzles while new generation rejects their historical identity', () => {
  const fixture = CLASSIC_PUZZLE_FIXTURES.find((item) => item.difficulty === 'easy')
  if (!fixture) {
    throw new Error('Missing authored Easy fixture')
  }

  const storedPuzzle = {
    givens: fixture.givens,
    solution: fixture.solution,
    difficulty: fixture.difficulty,
    seed: 'saved-before-lightweight-rating',
    puzzleVersion: 'sudoku-v7',
    rules: { kind: 'classic' },
  }
  const input = createGenerationInput('classic', 'easy', storedPuzzle.seed)

  expect(parsePuzzle(storedPuzzle)).toEqual({ valid: true, value: storedPuzzle })
  expect(parseGenerationInput({ ...input, puzzleVersion: storedPuzzle.puzzleVersion }).valid).toBe(
    false,
  )
  expect(input.puzzleVersion).toBe('sudoku-v10')
})
