import { expect, it } from 'vitest'
import { countSolutions } from './search'
import { countReferenceSolutions } from '../../../tests/support/referenceSudoku'
import {
  uniqueBoard,
  solvedBoard,
  emptyBoard,
  conflictingBoard,
  unsatisfiableBoard,
} from '../../../tests/fixtures/sudoku'

it.each([
  { board: solvedBoard, expected: 1 },
  { board: uniqueBoard, expected: 1 },
  { board: emptyBoard, expected: 2 },
  { board: conflictingBoard, expected: 0 },
  { board: unsatisfiableBoard, expected: 0 },
])('distinguishes zero one and multiple solutions: $expected', ({ board, expected }) => {
  const result = countSolutions(board, { maxSolutions: 2, nodeBudget: 1000000 })
  expect(result).toMatchObject({ status: 'complete', count: expected })
  expect(countReferenceSolutions(board, 2)).toBe(expected)
  if (expected === 1) expect(result).toMatchObject({ solution: solvedBoard })
})
it('never reports uniqueness after budget exhaustion', () => {
  expect(countSolutions(emptyBoard, { maxSolutions: 2, nodeBudget: 0 })).toEqual({
    status: 'budget-exhausted',
    nodesVisited: 0,
  })
  expect(countSolutions(uniqueBoard, { maxSolutions: 2, nodeBudget: 1 })).toMatchObject({
    status: 'budget-exhausted',
    nodesVisited: 1,
  })
})
it('does not mutate the source puzzle', () => {
  const board = [...uniqueBoard]
  countSolutions(board, { maxSolutions: 2, nodeBudget: 1000000 })
  expect(board).toEqual(uniqueBoard)
})
