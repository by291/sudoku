import { expect, it } from 'vitest'
import { parseBoard, calculateCandidates, findConflicts, isComplete } from '@/core/sudoku/board'
import {
  solvedBoard,
  uniqueBoard,
  conflictingBoard,
  unsatisfiableBoard,
} from '../../../tests/fixtures/sudoku'

it.each([
  [],
  Array(80).fill(0),
  Array(81).fill(10),
  Array(81).fill(0.5),
  Array(81).fill('1'),
  null,
])('rejects malformed boards %j', (value) => {
  expect(parseBoard(value).valid).toBe(false)
})
it('accepts valid board data without treating player conflicts as malformed', () => {
  expect(parseBoard(uniqueBoard)).toEqual({ valid: true, value: uniqueBoard })
  expect(parseBoard(conflictingBoard).valid).toBe(true)
})
it('calculates the only possible digit in a single empty cell', () => {
  const board = solvedBoard.map((value, index) => (index === 0 ? 0 : value))

  expect(calculateCandidates(board)).toEqual([16, ...Array(80).fill(0)])
})
it('reports duplicates and requires a valid full board for completion', () => {
  expect(findConflicts(conflictingBoard)).toEqual([0, 2])
  expect(findConflicts(unsatisfiableBoard)).toEqual([])
  expect(isComplete(solvedBoard)).toBe(true)
  expect(isComplete(uniqueBoard)).toBe(false)
})
