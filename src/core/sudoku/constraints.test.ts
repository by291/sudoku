import { expect, it } from 'vitest'
import { evaluateCandidates, evaluateConflicts } from '@/core/sudoku/constraints'
import { createWorkBudget } from '@/core/sudoku/budget'
import { compileRules } from '@/core/sudoku/rules'
import { isComplete, maskOf } from '@/core/sudoku/board'
import {
  ARROW_REPEAT_BOARD,
  ARROW_REPEAT_RULES,
  FULL_LENGTH_THERMO_RULES,
} from '../../../tests/fixtures/variants'
import type { Board } from '@/core/sudoku/types'
import { DIGITS } from '@/core/sudoku/types'
const empty: Board = Array(81).fill(0)
it('bounds a nine-cell thermo to digits one through nine', () => {
  const result = evaluateCandidates(
    empty,
    compileRules(FULL_LENGTH_THERMO_RULES),
    createWorkBudget(1000000),
  )
  expect(result.status).toBe('complete')
  if (result.status !== 'complete') throw new Error('Expected finite support')
  expect(result.candidates[0]).toBe(maskOf(1))
  expect(result.candidates[8]).toBe(maskOf(9))
})
it('retains supported repeated arrow digits', () => {
  const context = compileRules(ARROW_REPEAT_RULES)
  expect(evaluateConflicts(ARROW_REPEAT_BOARD, context, createWorkBudget(1000000))).toEqual({
    status: 'complete',
    violations: [],
  })
  const partial = [...ARROW_REPEAT_BOARD]
  partial[40] = 0
  const result = evaluateCandidates(partial, context, createWorkBudget(1000000))
  expect(result.status).toBe('complete')
  if (result.status === 'complete') expect(result.candidates[40]).toBe(maskOf(2))
})
it('rejects an impossible partial cage total without using a stored solution', () => {
  const context = compileRules({
    kind: 'killer',
    cages: [
      { cells: [0, 1], sum: 3 },
      ...Array.from({ length: 79 }, (_, i) => ({ cells: [i + 2], sum: 1 })),
    ],
  })
  const board = [...empty]
  board[0] = 4
  const result = evaluateConflicts(board, context, createWorkBudget(1000000))
  expect(result.violations).toContainEqual({
    constraintId: 'cage:0',
    cells: [0, 1],
    message: expect.stringContaining('总和'),
  })
})
it('returns inconclusive when support enumeration exhausts', () => {
  const context = compileRules(ARROW_REPEAT_RULES)
  const budget = createWorkBudget(0)
  expect(evaluateCandidates(empty, context, budget)).toEqual({ status: 'budget-exhausted' })
  expect(evaluateConflicts(empty, context, budget).status).toBe('budget-exhausted')
  expect(budget.used).toBe(0)
})
it('charges repeated propagation against the same budget', () => {
  const budget = createWorkBudget(7)
  const result = evaluateCandidates(empty, compileRules(FULL_LENGTH_THERMO_RULES), budget)
  expect(result.status).toBe('budget-exhausted')
  expect(budget.used).toBeLessThanOrEqual(7)
})
it('reports direct order violations and rejects full Classic boards under additional rules', () => {
  const board: Board = Array.from(
    { length: 81 },
    (_, cell) => DIGITS[(Math.floor(cell / 9) * 3 + Math.floor(cell / 27) + (cell % 9)) % 9],
  )
  expect(isComplete(board)).toBe(true)
  const context = compileRules({ kind: 'thermo', paths: [[1, 0]] })
  expect(isComplete(board, context)).toBe(false)
  expect(
    evaluateConflicts(board, context, createWorkBudget(1000000)).violations[0].message,
  ).toContain('递增')
})
