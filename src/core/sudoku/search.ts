import { calculateCandidates, digitsIn, isComplete, parseBoard } from '@/core/sudoku/board'
import { CLASSIC_CONTEXT } from '@/core/sudoku/rules'
import type { RuleContext } from '@/core/sudoku/rules'
import { createWorkBudget, consumeWork } from '@/core/sudoku/budget'
import type { WorkBudget } from '@/core/sudoku/budget'
import { evaluateCandidates } from '@/core/sudoku/constraints'
import type { Board, SearchResult } from '@/core/sudoku/types'

export function countSolutions(
  board: Board,
  options: { maxSolutions: 2; nodeBudget: number; context?: RuleContext; workBudget?: WorkBudget },
): SearchResult {
  if (!Number.isInteger(options.nodeBudget) || options.nodeBudget < 0)
    throw new RangeError('Search budget must be a nonnegative integer')
  if (!parseBoard(board).valid) throw new TypeError('Invalid board shape')
  const context = options.context ?? CLASSIC_CONTEXT
  const budget = options.workBudget ?? createWorkBudget(options.nodeBudget)
  const startedWork = budget.used
  const duplicates = context.duplicatePeers.some(
    (peers, cell) => board[cell] !== 0 && peers.some((peer) => board[peer] === board[cell]),
  )
  if (duplicates || (board.every((digit) => digit !== 0) && !isComplete(board, context)))
    return { status: 'complete', count: 0, solution: null, nodesVisited: 0, workUsed: 0 }
  const workspace = [...board]
  let found = 0
  let solution: Board | null = null
  let nodesVisited = 0
  let exhausted = false
  function visit(): void {
    if (found >= options.maxSolutions || exhausted) return
    if (nodesVisited >= options.nodeBudget || !consumeWork(budget)) {
      exhausted = true
      return
    }
    nodesVisited++
    const evaluated =
      context.rules.kind === 'classic'
        ? ({ status: 'complete', candidates: calculateCandidates(workspace) } as const)
        : evaluateCandidates(workspace, context, budget)
    if (evaluated.status === 'budget-exhausted') {
      exhausted = true
      return
    }
    const candidates = evaluated.candidates
    let target = -1
    let choices = 10
    for (let cell = 0; cell < workspace.length; cell++) {
      if (workspace[cell] !== 0) continue
      const count = digitsIn(candidates[cell]).length
      if (count === 0) return
      if (count < choices) {
        target = cell
        choices = count
      }
    }
    if (target === -1) {
      if (isComplete(workspace, context)) {
        found++
        solution ??= [...workspace]
      }
      return
    }
    for (const digit of digitsIn(candidates[target])) {
      workspace[target] = digit
      visit()
      workspace[target] = 0
      if (found >= options.maxSolutions || exhausted) break
    }
  }
  visit()
  if (exhausted)
    return { status: 'budget-exhausted', nodesVisited, workUsed: budget.used - startedWork }
  return {
    status: 'complete',
    count: found === 0 ? 0 : found === 1 ? 1 : 2,
    solution,
    nodesVisited,
    workUsed: budget.used - startedWork,
  }
}
