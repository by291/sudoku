import { getConstraintSupport } from '@/core/sudoku/constraints/support'
import type { PreparedConstraintSupport } from '@/core/sudoku/constraints/types'
import { calculateBaseCandidates } from '@/core/sudoku/board'
import { consumeWork } from '@/core/sudoku/budget'
import type { WorkBudget } from '@/core/sudoku/budget'
import type { RuleContext } from '@/core/sudoku/rules/types'
import type { Board, NoteMask } from '@/core/sudoku/types'

export type CandidateResult =
  { status: 'complete'; candidates: readonly NoteMask[] } | { status: 'budget-exhausted' }

export function evaluateCandidates(
  board: Board,
  context: RuleContext,
  budget: WorkBudget,
  support?: PreparedConstraintSupport,
): CandidateResult {
  const candidates = [...calculateBaseCandidates(board, context)]
  let changed = true

  while (changed) {
    changed = false

    for (const constraint of context.constraints) {
      if (!consumeWork(budget)) {
        return { status: 'budget-exhausted' }
      }

      const localSupport = support
        ? support.get(board, candidates, constraint, budget)
        : getConstraintSupport(board, candidates, context, constraint, budget)
      if (localSupport.status === 'budget-exhausted') {
        return localSupport
      }

      if (localSupport.supports.some((mask) => mask === 0)) {
        return { status: 'complete', candidates: candidates.map(() => 0) }
      }

      for (let i = 0; i < localSupport.cells.length; i++) {
        const cell = localSupport.cells[i]
        if (board[cell] !== 0) {
          continue
        }

        const reduced = candidates[cell] & localSupport.supports[i]
        if (reduced !== candidates[cell]) {
          candidates[cell] = reduced
          changed = true
        }
      }
    }
  }

  return { status: 'complete', candidates }
}
