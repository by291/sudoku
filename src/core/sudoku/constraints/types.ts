import type { WorkBudget } from '@/core/sudoku/budget'
import type { RuleConstraint, RuleContext } from '@/core/sudoku/rules/types'
import type { Board, NoteMask } from '@/core/sudoku/types'

export type ConstraintSupport =
  | { status: 'complete'; cells: readonly number[]; supports: readonly NoteMask[] }
  | { status: 'budget-exhausted' }

export type CageSupportMemo = Map<
  Extract<RuleConstraint, { kind: 'cage' }>,
  {
    context: RuleContext
    sum: number
    cells: readonly number[]
    domains: readonly NoteMask[]
    supports: readonly NoteMask[]
  }
>

export type PreparedConstraintSupport = {
  get(
    board: Board,
    candidates: readonly NoteMask[],
    constraint: RuleConstraint,
    budget: WorkBudget,
  ): ConstraintSupport
}

export type PreparedRuleComputation = {
  readonly context: RuleContext
  readonly support: PreparedConstraintSupport
}

export type CatalogueLimits = { maxTuplesPerConstraint: number; maxTuplesPerLayout: number }
