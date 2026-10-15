import { expect, it } from 'vitest'
import { consumeWork, createWorkBudget, withWorkStage } from '@/core/sudoku/budget'

it('charges work without exceeding a fixed nonnegative budget', () => {
  const budget = createWorkBudget(2)

  expect(consumeWork(budget)).toBe(true)
  expect(consumeWork(budget, 2)).toBe(false)
  expect(budget.used).toBe(1)
  expect(consumeWork(budget)).toBe(true)
  expect(consumeWork(budget)).toBe(false)
  expect(budget.used).toBe(2)
  expect(() => createWorkBudget(-1)).toThrow(RangeError)
})

it('attributes nested work exclusively and restores the stage on every exit', () => {
  const budget = {
    ...createWorkBudget(3),
    accounting: {
      stage: 'preparation' as const,
      byStage: { preparation: 0, arithmetic: 0, exact: 0, logic: 0, proposals: 0 },
    },
  }

  consumeWork(budget)

  expect(() =>
    withWorkStage(budget, 'arithmetic', () => {
      consumeWork(budget, 2)
      throw new Error('interrupted')
    }),
  ).toThrow('interrupted')

  expect(budget.used).toBe(3)
  expect(budget.accounting.byStage).toEqual({
    preparation: 1,
    arithmetic: 2,
    exact: 0,
    logic: 0,
    proposals: 0,
  })
  expect(budget.accounting.stage).toBe('preparation')
  expect(consumeWork(budget)).toBe(false)
})
