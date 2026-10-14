import { isComplete, parseBoard } from '@/core/sudoku/board'
import { CLASSIC_CONTEXT } from '@/core/sudoku/rules'
import type { RuleContext } from '@/core/sudoku/rules'
import { createWorkBudget } from '@/core/sudoku/budget'
import type { WorkBudget } from '@/core/sudoku/budget'
import { countPropagationSolutions } from '@/core/sudoku/propagationSearch'
import type { Board, SearchResult } from '@/core/sudoku/types'

export function countSolutions(
  board: Board,
  options: { maxSolutions: 2; nodeBudget: number; context?: RuleContext; workBudget?: WorkBudget },
): SearchResult {
  if (!Number.isInteger(options.nodeBudget) || options.nodeBudget < 0) {
    throw new RangeError('Search budget must be a nonnegative integer')
  }

  if (!parseBoard(board).valid) {
    throw new TypeError('Invalid board shape')
  }

  const context = options.context ?? CLASSIC_CONTEXT
  const budget = options.workBudget ?? createWorkBudget(options.nodeBudget)
  const duplicates = context.duplicatePeers.some(
    (peers, cell) => board[cell] !== 0 && peers.some((peer) => board[peer] === board[cell]),
  )
  if (duplicates || (board.every((digit) => digit !== 0) && !isComplete(board, context))) {
    return { status: 'complete', count: 0, solution: null, nodesVisited: 0, workUsed: 0 }
  }

  return countPropagationSolutions(board, context, budget, options.nodeBudget)
}
