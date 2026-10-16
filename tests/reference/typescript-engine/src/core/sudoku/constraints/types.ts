import type { WorkBudget } from '@/core/sudoku/budget'
import type { RuleConstraint, RuleContext } from '@/core/sudoku/rules/types'
import type { Board, NoteMask } from '@/core/sudoku/types'

export type ConstraintSupport =
  | { status: 'complete'; cells: readonly number[]; supports: readonly NoteMask[] }
  | { status: 'budget-exhausted' }

/** Complete, domain-dependent proofs belong to one logical workspace, never another trial. */
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

/** Queries only constraints from its owning context and consumes the caller's budget. */
export type PreparedConstraintSupport = {
  get(
    board: Board,
    candidates: readonly NoteMask[],
    constraint: RuleConstraint,
    budget: WorkBudget,
  ): ConstraintSupport
}

/** Owned layout topology and complete static support may be borrowed across fresh board probes. */
export type PreparedRuleComputation = {
  readonly context: RuleContext
  readonly support: PreparedConstraintSupport
}

export type CatalogueLimits = { maxTuplesPerConstraint: number; maxTuplesPerLayout: number }
