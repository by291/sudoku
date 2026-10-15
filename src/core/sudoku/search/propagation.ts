import { calculateBaseCandidates, digitsIn, isComplete, maskOf } from '@/core/sudoku/board'
import { consumeWork } from '@/core/sudoku/budget'
import type { WorkBudget } from '@/core/sudoku/budget'
import type { PreparedRuleComputation } from '@/core/sudoku/constraints/types'
import { BOARD_SIZE, DIGITS, UNIT_SIZE } from '@/core/sudoku/types'
import type { Board, NoteMask, SearchResult } from '@/core/sudoku/types'

/**
 * Counts up to two solutions for validated input using local finite domains. Branches own
 * reversible domain changes; propagation and recursive visits share the caller's remaining allowance.
 */
export function countPropagationSolutions(
  board: Board,
  computation: PreparedRuleComputation,
  budget: WorkBudget,
  nodeLimit: number,
): SearchResult {
  const { context, support: preparedSupport } = computation
  const startedWork = budget.used
  // Filled cells retain singleton domains, unlike presentation candidates which use zero.
  const domains = calculateBaseCandidates(board, context).map((mask, cell) =>
    board[cell] === 0 ? mask : maskOf(board[cell]),
  )
  const unitMemberships = context.cellUnits
  const constraintMemberships = context.cellConstraints
  const trail: { cell: number; previous: NoteMask }[] = []

  function assign(cell: number, mask: NoteMask): void {
    if (domains[cell] !== mask) {
      trail.push({ cell, previous: domains[cell] })
      domains[cell] = mask
    }
  }

  function undo(mark: number): void {
    while (trail.length > mark) {
      const change = trail.pop()
      if (!change) {
        throw new Error('Missing reversible domain change')
      }
      domains[change.cell] = change.previous
    }
  }

  // All assignments live in domains. Passing a zero board lets clue support consume those
  // domains, including propagated singletons, without freezing the original givens separately.
  const unassigned: Board = Array(BOARD_SIZE).fill(0)
  let exhausted = false
  let nodesVisited = 0
  let count: 0 | 1 | 2 = 0
  let solution: Board | null = null

  function charge(): boolean {
    if (!consumeWork(budget)) {
      exhausted = true
      return false
    }
    return true
  }

  function propagate(changedCell?: number): boolean {
    const cells =
      changedCell === undefined
        ? Array.from({ length: BOARD_SIZE }, (_, cell) => cell)
        : [changedCell]
    const units = new Set(
      changedCell === undefined
        ? context.units.map((_, index) => index)
        : unitMemberships[changedCell],
    )
    const constraints = new Set(
      changedCell === undefined
        ? context.constraints.map((_, index) => index)
        : constraintMemberships[changedCell],
    )

    function reduce(cell: number, reduced: NoteMask): boolean {
      if (reduced === 0) {
        return false
      }
      if (reduced === domains[cell]) {
        return true
      }
      assign(cell, reduced)
      cells.push(cell)
      for (const index of unitMemberships[cell]) {
        units.add(index)
      }
      for (const index of constraintMemberships[cell]) {
        constraints.add(index)
      }
      return true
    }

    while (cells.length || units.size || constraints.size) {
      while (cells.length) {
        if (!charge()) {
          return false
        }
        const cell = cells.pop()
        if (cell === undefined) {
          throw new Error('Missing propagation cell')
        }
        const mask = domains[cell]
        if (mask === 0) {
          return false
        }
        if ((mask & (mask - 1)) !== 0) {
          continue
        }
        for (const peer of context.duplicatePeers[cell]) {
          if (!reduce(peer, domains[peer] & ~mask)) {
            return false
          }
        }
      }

      const unitIndex = units.values().next().value
      if (unitIndex !== undefined) {
        units.delete(unitIndex)
        // One unit sweep is bounded by nine digits and nine positions. Only full units
        // require every digit; cages and arithmetic paths must not enter this queue.
        if (!charge()) {
          return false
        }
        for (const digit of DIGITS) {
          const bit = maskOf(digit)
          let lastPosition = -1
          let positions = 0
          for (const cell of context.units[unitIndex].cells) {
            if (domains[cell] & bit) {
              lastPosition = cell
              positions++
              if (positions === 2) {
                break
              }
            }
          }
          if (positions === 0) {
            return false
          }
          if (positions === 1 && !reduce(lastPosition, bit)) {
            return false
          }
        }
        continue
      }

      const constraintIndex = constraints.values().next().value
      if (constraintIndex === undefined) {
        continue
      }
      constraints.delete(constraintIndex)
      if (!charge()) {
        return false
      }
      const support = preparedSupport.get(
        unassigned,
        domains,
        context.constraints[constraintIndex],
        budget,
      )
      if (support.status === 'budget-exhausted') {
        exhausted = true
        return false
      }
      for (let position = 0; position < support.cells.length; position++) {
        const cell = support.cells[position]
        if (!reduce(cell, domains[cell] & support.supports[position])) {
          return false
        }
      }
    }
    return true
  }

  function visit(changedCell?: number): void {
    if (nodesVisited >= nodeLimit || !charge()) {
      exhausted = true
      return
    }
    nodesVisited++
    if (!propagate(changedCell)) {
      return
    }

    let target = -1
    let fewest = UNIT_SIZE + 1
    for (let cell = 0; cell < BOARD_SIZE; cell++) {
      const size = digitsIn(domains[cell]).length
      if (size > 1 && size < fewest) {
        target = cell
        fewest = size
      }
    }
    if (target === -1) {
      const completed = domains.map((mask) => digitsIn(mask)[0])
      if (isComplete(completed, context)) {
        count = count === 0 ? 1 : 2
        solution ??= completed
      }
      return
    }

    for (const digit of digitsIn(domains[target])) {
      // Restore even on work exhaustion or thrown validation; child queues are local.
      const mark = trail.length
      assign(target, maskOf(digit))
      try {
        visit(target)
      } finally {
        undo(mark)
      }
      if (exhausted || count === 2) {
        return
      }
    }
  }

  try {
    visit()
  } finally {
    undo(0)
  }
  const workUsed = budget.used - startedWork
  return exhausted
    ? { status: 'budget-exhausted', nodesVisited, workUsed }
    : { status: 'complete', count, solution, nodesVisited, workUsed }
}
