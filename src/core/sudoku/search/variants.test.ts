import { expect, it } from 'vitest'
import { countSolutions } from '@/core/sudoku/search/exact'
import { createWorkBudget } from '@/core/sudoku/budget'
import { compileRules } from '@/core/sudoku/rules/context'
import { referenceCountSolutions } from '../../../../tests/support/referenceVariants'
import {
  ARROW_REPEAT_RULES,
  ARROW_REPEAT_BOARD,
  FULL_LENGTH_THERMO_RULES,
  VARIANT_FIXTURES,
} from '../../../../tests/fixtures/variants'
import type { Board, Digit } from '@/core/sudoku/types'

const digits: readonly Digit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]

const solution: Board = Array.from(
  { length: 81 },
  (_, cell) => digits[(Math.floor(cell / 9) * 3 + Math.floor(cell / 27) + (cell % 9)) % 9],
)

it('solves the fully specified thermo independently', () => {
  const board = [...solution]
  board[0] = 0

  expect(referenceCountSolutions(board, FULL_LENGTH_THERMO_RULES)).toEqual({ count: 1, solution })
  expect(
    countSolutions(board, {
      maxSolutions: 2,
      nodeBudget: 1000000,
      context: compileRules(FULL_LENGTH_THERMO_RULES),
    }),
  ).toMatchObject({ status: 'complete', count: 1, solution })
})

it('rejects a filled Classic board that violates an active rule', () => {
  const rules = { kind: 'thermo', paths: [[1, 0]] } as const

  expect(referenceCountSolutions(solution, rules).count).toBe(0)
  expect(
    countSolutions(solution, { maxSolutions: 2, nodeBudget: 100, context: compileRules(rules) }),
  ).toMatchObject({ status: 'complete', count: 0 })
})

it('cannot claim uniqueness after arithmetic exhaustion', () => {
  expect(
    countSolutions(ARROW_REPEAT_BOARD, {
      maxSolutions: 2,
      nodeBudget: 1000000,
      context: compileRules(ARROW_REPEAT_RULES),
      workBudget: createWorkBudget(0),
    }).status,
  ).toBe('budget-exhausted')
})

it.each(Object.entries(VARIANT_FIXTURES))(
  'verifies a %s solution against independently known facts',
  (_, fixture) => {
    expect(referenceCountSolutions(fixture.givens, fixture.rules)).toEqual({
      count: 1,
      solution: fixture.solution,
    })
    expect(
      countSolutions(fixture.givens, {
        maxSolutions: 2,
        nodeBudget: 1000000,
        context: compileRules(fixture.rules),
      }),
    ).toMatchObject({ status: 'complete', count: 1, solution: fixture.solution })
  },
)

it('allows multiple Arrow solutions including repeated shaft digits', () => {
  expect(referenceCountSolutions(ARROW_REPEAT_BOARD, ARROW_REPEAT_RULES).count).toBe(2)
  expect(
    countSolutions(ARROW_REPEAT_BOARD, {
      maxSolutions: 2,
      nodeBudget: 1000000,
      context: compileRules(ARROW_REPEAT_RULES),
    }),
  ).toMatchObject({ status: 'complete', count: 2 })
})
