import type { WorkBudget } from '@/core/sudoku/budget'
import { prepareRuleContext } from '@/core/sudoku/rules/context'
import type { PuzzleRules } from '@/core/sudoku/rules/types'
import type { PreparedRuleComputation } from '@/core/sudoku/constraints/types'
import { prepareConstraintSupport } from '@/core/sudoku/constraints/support'

/** All preparation consumes the same request budget; partial catalogues never escape. */
export function prepareRuleComputation(
  rules: PuzzleRules,
  budget: WorkBudget,
): { status: 'ready'; computation: PreparedRuleComputation } | { status: 'budget-exhausted' } {
  const compiled = prepareRuleContext(rules, budget)
  if (compiled.status !== 'ready') {
    return compiled
  }
  const prepared = prepareConstraintSupport(compiled.context, budget)
  if (prepared.status !== 'ready') {
    return prepared
  }

  return {
    status: 'ready',
    computation: Object.freeze({ context: compiled.context, support: prepared.support }),
  }
}
