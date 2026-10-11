import { calculateCandidates, digitsIn, findConflicts, parseBoard } from '@/core/sudoku/board'
import type { Board, SearchResult } from '@/core/sudoku/types'

export function countSolutions(
  board: Board,
  options: { maxSolutions: 2; nodeBudget: number },
): SearchResult {
  if (!Number.isInteger(options.nodeBudget) || options.nodeBudget < 0)
    throw new RangeError('Search budget must be a nonnegative integer')
  if (!parseBoard(board).valid) throw new TypeError('Invalid board shape')
  if (findConflicts(board).length)
    return { status: 'complete', count: 0, solution: null, nodesVisited: 0 }
  const workspace = [...board]
  let found = 0
  let solution: Board | null = null
  let nodesVisited = 0
  let exhausted = false
  function visit(): void {
    if (found >= options.maxSolutions || exhausted) return
    if (nodesVisited >= options.nodeBudget) {
      exhausted = true
      return
    }
    nodesVisited++
    const candidates = calculateCandidates(workspace)
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
      found++
      solution ??= [...workspace]
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
  if (exhausted) return { status: 'budget-exhausted', nodesVisited }
  return {
    status: 'complete',
    count: found === 0 ? 0 : found === 1 ? 1 : 2,
    solution,
    nodesVisited,
  }
}
