import { calculateBaseCandidates, digitsIn, isComplete, maskOf } from '@/core/sudoku/board'
import { consumeWork } from '@/core/sudoku/budget'
import type { WorkBudget } from '@/core/sudoku/budget'
import { getConstraintSupport } from '@/core/sudoku/constraints'
import { constraintCells } from '@/core/sudoku/rules'
import type { RuleContext } from '@/core/sudoku/rules'
import { BOARD_SIZE, DIGITS, UNIT_SIZE } from '@/core/sudoku/types'
import type { Board, NoteMask, SearchResult } from '@/core/sudoku/types'

/**
 * Counts up to two solutions for validated input using local finite domains. Branches own
 * their snapshots; propagation and recursive visits share the caller's remaining allowance.
 */
export function countPropagationSolutions(
  board: Board,
  context: RuleContext,
  budget: WorkBudget,
  nodeLimit: number,
): SearchResult {
  const startedWork = budget.used
  // Filled cells retain singleton domains, unlike presentation candidates which use zero.
  const domains = calculateBaseCandidates(board, context).map((mask, cell) =>
    board[cell] === 0 ? mask : maskOf(board[cell]),
  )
  const unitMemberships: number[][] = Array.from({ length: BOARD_SIZE }, () => [])
  const constraintMemberships: number[][] = Array.from({ length: BOARD_SIZE }, () => [])
  context.units.forEach((unit, index) => {
    for (const cell of unit.cells) {
      unitMemberships[cell].push(index)
    }
  })
  context.constraints.forEach((constraint, index) => {
    for (const cell of constraintCells(constraint)) {
      constraintMemberships[cell].push(index)
    }
  })
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

  function propagate(current: NoteMask[], changedCell?: number): boolean {
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
      if (reduced === current[cell]) {
        return true
      }
      current[cell] = reduced
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
        const mask = current[cell]
        if (mask === 0) {
          return false
        }
        if ((mask & (mask - 1)) !== 0) {
          continue
        }
        for (const peer of context.duplicatePeers[cell]) {
          if (!reduce(peer, current[peer] & ~mask)) {
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
            if (current[cell] & bit) {
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
      const support = getConstraintSupport(
        unassigned,
        current,
        context,
        context.constraints[constraintIndex],
        budget,
      )
      if (support.status === 'budget-exhausted') {
        exhausted = true
        return false
      }
      for (let position = 0; position < support.cells.length; position++) {
        const cell = support.cells[position]
        if (!reduce(cell, current[cell] & support.supports[position])) {
          return false
        }
      }
    }
    return true
  }

  function visit(current: NoteMask[], changedCell?: number): void {
    if (nodesVisited >= nodeLimit || !charge()) {
      exhausted = true
      return
    }
    nodesVisited++
    if (!propagate(current, changedCell)) {
      return
    }

    let target = -1
    let fewest = UNIT_SIZE + 1
    for (let cell = 0; cell < BOARD_SIZE; cell++) {
      const size = digitsIn(current[cell]).length
      if (size > 1 && size < fewest) {
        target = cell
        fewest = size
      }
    }
    if (target === -1) {
      const completed = current.map((mask) => digitsIn(mask)[0])
      if (isComplete(completed, context)) {
        count = count === 0 ? 1 : 2
        solution ??= completed
      }
      return
    }

    for (const digit of digitsIn(current[target])) {
      // A branch only narrows its own snapshot. The parent is already at a fixed point,
      // so only this assignment and its affected units/clues need to enter the child queue.
      const child = [...current]
      child[target] = maskOf(digit)
      visit(child, target)
      if (exhausted || count === 2) {
        return
      }
    }
  }

  visit(domains)
  const workUsed = budget.used - startedWork
  return exhausted
    ? { status: 'budget-exhausted', nodesVisited, workUsed }
    : { status: 'complete', count, solution, nodesVisited, workUsed }
}
