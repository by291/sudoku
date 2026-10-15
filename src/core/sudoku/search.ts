import { isComplete, parseBoard } from '@/core/sudoku/board'
import { CLASSIC_CONTEXT } from '@/core/sudoku/rules/context'
import type { RuleContext } from '@/core/sudoku/rules/types'
import { createWorkBudget, withWorkStage } from '@/core/sudoku/budget'
import type { WorkBudget } from '@/core/sudoku/budget'
import { prepareRuleComputation } from '@/core/sudoku/constraintSupport'
import type { PreparedRuleComputation } from '@/core/sudoku/constraintSupport'
import { countPropagationSolutions } from '@/core/sudoku/propagationSearch'
import type { Board, SearchResult } from '@/core/sudoku/types'

export type PreparedExactValidator = {
  count(board: Board, budget: WorkBudget, nodeBudget: number): SearchResult
}

function validateSearch(board: Board, nodeBudget: number): void {
  if (!Number.isSafeInteger(nodeBudget) || nodeBudget < 0) {
    throw new RangeError('Search budget must be a nonnegative integer')
  }
  if (!parseBoard(board).valid) {
    throw new TypeError('Invalid board shape')
  }
}

function directlyContradictory(board: Board, context: RuleContext): boolean {
  return (
    context.duplicatePeers.some(
      (peers, cell) => board[cell] !== 0 && peers.some((peer) => board[peer] === board[cell]),
    ) ||
    (board.every((digit) => digit !== 0) && !isComplete(board, context))
  )
}

/** The immutable preparation may serve many boards; domains and returned solutions never cross probes. */
export function prepareExactValidator(
  computation: PreparedRuleComputation,
): PreparedExactValidator {
  return {
    count(board, budget, nodeBudget) {
      validateSearch(board, nodeBudget)
      if (directlyContradictory(board, computation.context)) {
        return { status: 'complete', count: 0, solution: null, nodesVisited: 0, workUsed: 0 }
      }

      return withWorkStage(budget, 'exact', () =>
        countPropagationSolutions(board, computation, budget, nodeBudget),
      )
    },
  }
}

export function countSolutions(
  board: Board,
  options: { maxSolutions: 2; nodeBudget: number; context?: RuleContext; workBudget?: WorkBudget },
): SearchResult {
  validateSearch(board, options.nodeBudget)
  const context = options.context ?? CLASSIC_CONTEXT
  const budget = options.workBudget ?? createWorkBudget(options.nodeBudget)
  if (directlyContradictory(board, context)) {
    return { status: 'complete', count: 0, solution: null, nodesVisited: 0, workUsed: 0 }
  }

  const started = budget.used
  // Standalone calls own preparation too; a supplied context is not an uncharged catalogue cache.
  const prepared = prepareRuleComputation(context.rules, budget)
  if (prepared.status !== 'ready') {
    return { status: 'budget-exhausted', nodesVisited: 0, workUsed: budget.used - started }
  }
  const result = prepareExactValidator(prepared.computation).count(
    board,
    budget,
    options.nodeBudget,
  )

  return { ...result, workUsed: budget.used - started }
}
