import { expect, it } from 'vitest'
import { consumeWork, createWorkBudget } from '@/core/sudoku/budget'
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
