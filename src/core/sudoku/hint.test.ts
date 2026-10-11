import { expect, it } from 'vitest'
import { analyzeHint } from './hint'
import {
  emptyBoard,
  solvedBoard,
  uniqueBoard,
  unsatisfiableBoard,
} from '../../../tests/fixtures/sudoku'
it('flags an incorrect entry without silently changing it', () => {
  expect(analyzeHint(unsatisfiableBoard, solvedBoard, 500)).toEqual({
    kind: 'review-entry',
    cell: 2,
  })
  expect(unsatisfiableBoard[2]).toBe(1)
})
it('returns a provable placement from filled values only', () => {
  const board = solvedBoard.map((value, cell) => (cell === 0 ? 0 : value))
  expect(analyzeHint(board, solvedBoard, 500)).toMatchObject({
    kind: 'deduction',
    placement: { cell: 0, digit: 5 },
    steps: [{ kind: 'placement', cell: 0, digit: 5 }],
  })
})
it('never exposes search answers for unsupported positions', () => {
  expect(analyzeHint(emptyBoard, solvedBoard, 500)).toEqual({
    kind: 'unavailable',
    reason: 'unsupported',
  })
  expect(analyzeHint(uniqueBoard, solvedBoard, 0)).toEqual({
    kind: 'unavailable',
    reason: 'budget-exhausted',
  })
  expect(analyzeHint(solvedBoard, solvedBoard, 500)).toEqual({
    kind: 'unavailable',
    reason: 'complete',
  })
})
