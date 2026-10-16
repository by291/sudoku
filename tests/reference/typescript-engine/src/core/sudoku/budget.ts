// Search, clue enumeration and logical deductions charge the same mutable budget.
// Exhaustion is inconclusive and must never mean zero solutions or a contradiction.
export type WorkStage = 'preparation' | 'arithmetic' | 'exact' | 'logic' | 'proposals'

export type WorkAccounting = { stage: WorkStage; byStage: Record<WorkStage, number> }

export type WorkBudget = { limit: number; used: number; accounting?: WorkAccounting }

export const DEFAULT_WORK_LIMIT = 1000000

export function createWorkBudget(limit: number): WorkBudget {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new RangeError('Work limit must be a nonnegative safe integer')
  }

  return { limit, used: 0 }
}

/** Charge before performing work; a rejected charge leaves the counter unchanged. */
export function consumeWork(budget: WorkBudget, units = 1): boolean {
  if (!Number.isSafeInteger(units) || units < 0) {
    throw new RangeError('Work charge must be nonnegative')
  }

  if (units > budget.limit - budget.used) {
    return false
  }

  budget.used += units
  if (budget.accounting) {
    budget.accounting.byStage[budget.accounting.stage] += units
  }

  return true
}

/** Nested operations attribute actual charges exclusively and restore their caller's stage. */
export function withWorkStage<T>(budget: WorkBudget, stage: WorkStage, operation: () => T): T {
  const accounting = budget.accounting
  if (!accounting) {
    return operation()
  }

  const previous = accounting.stage
  accounting.stage = stage
  try {
    return operation()
  } finally {
    accounting.stage = previous
  }
}
