export type WorkBudget = { limit: number; used: number }
export const DEFAULT_WORK_LIMIT = 1000000
export function createWorkBudget(limit: number): WorkBudget {
  if (!Number.isSafeInteger(limit) || limit < 0)
    throw new RangeError('Work limit must be a nonnegative safe integer')
  return { limit, used: 0 }
}
export function consumeWork(budget: WorkBudget, units = 1): boolean {
  if (!Number.isSafeInteger(units) || units < 0)
    throw new RangeError('Work charge must be nonnegative')
  if (units > budget.limit - budget.used) return false
  budget.used += units
  return true
}
