import { digitsIn, isComplete } from '@/core/sudoku/board'
import { consumeWork } from '@/core/sudoku/budget'
import type { WorkBudget } from '@/core/sudoku/budget'
import type { RuleContext } from '@/core/sudoku/rules/types'
import { shuffle } from '@/core/sudoku/random'
import { BOARD_SIZE, UNIT_SIZE, DIGITS, ALL_DIGITS_MASK } from '@/core/sudoku/types'
import type { Board, CellValue } from '@/core/sudoku/types'

const REGIONAL_TERMINAL_NODE_LIMIT = BOARD_SIZE * BOARD_SIZE

export type TerminalConstructionResult =
  | { status: 'ready'; solution: Board }
  | { status: 'budget-exhausted' }
  | { status: 'attempt-exhausted' }
  | { status: 'failed'; reason: string }

/** Uses the caller's stream and aggregate work; local exhaustion leaves allowance for retry. */
export function constructUnitTerminal(
  context: RuleContext,
  random: () => number,
  budget: WorkBudget,
  nodeLimit?: number,
): TerminalConstructionResult {
  if (
    !['classic', 'diagonal', 'jigsaw'].includes(context.rules.kind) ||
    context.constraints.length !== 0 ||
    context.units.length < UNIT_SIZE * 3 ||
    context.units.some(
      (unit) => unit.cells.length !== UNIT_SIZE || new Set(unit.cells).size !== UNIT_SIZE,
    )
  ) {
    return { status: 'failed', reason: 'Terminal construction requires complete Sudoku units' }
  }

  const board: CellValue[] = Array(BOARD_SIZE).fill(0)
  const regional = context.rules.kind === 'jigsaw'
  const maxNodes = nodeLimit ?? (regional ? REGIONAL_TERMINAL_NODE_LIMIT : Infinity)
  if (maxNodes < 0 || (!Number.isSafeInteger(maxNodes) && maxNodes !== Infinity)) {
    throw new RangeError('Terminal node limit must be a nonnegative integer')
  }

  const unitMasks = context.units.map(() => 0)
  const memberships = Array.from({ length: BOARD_SIZE }, (_, cell) =>
    context.units.flatMap((unit, index) => (unit.cells.includes(cell) ? [index] : [])),
  )
  let exhausted = false
  let attemptExhausted = false
  let nodes = 0

  function assign(cell: number, digit: CellValue) {
    const previous = board[cell]
    board[cell] = digit
    // A candidate never duplicates a unit digit, so undo removes only this cell's bit.
    for (const index of memberships[cell]) {
      if (previous !== 0) {
        unitMasks[index] &= ~(1 << (previous - 1))
      }
      if (digit !== 0) {
        unitMasks[index] |= 1 << (digit - 1)
      }
    }
  }

  function candidatesForTerminal() {
    return board.map((value, cell) => {
      if (value !== 0) {
        return 0
      }

      let used = 0

      for (const index of memberships[cell]) {
        used |= unitMasks[index]
      }

      return ALL_DIGITS_MASK & ~used
    })
  }

  function visit(): boolean {
    if (nodes >= maxNodes) {
      attemptExhausted = true

      return false
    }
    if (!consumeWork(budget)) {
      exhausted = true

      return false
    }

    nodes++

    const candidates = candidatesForTerminal()
    let target = -1
    let smallest = 10

    for (let cell = 0; cell < BOARD_SIZE; cell++) {
      if (board[cell] !== 0) {
        continue
      }

      const choices = digitsIn(candidates[cell]).length
      if (choices === 0) {
        return false
      }
      if (choices < smallest) {
        target = cell
        smallest = choices
      }
    }

    if (target === -1) {
      return isComplete(board, context)
    }

    let assignments = digitsIn(candidates[target]).map((digit) => ({ cell: target, digit }))
    if (regional) {
      // A missing unit digit may have fewer positions than any cell has digits. Branch on
      // that constraint to avoid exploring impossible regional grids; Classic stays unchanged.
      for (let index = 0; index < context.units.length; index++) {
        const unit = context.units[index]

        for (const digit of DIGITS) {
          const bit = 1 << (digit - 1)
          if (unitMasks[index] & bit) {
            continue
          }

          const positions: number[] = []

          for (const cell of unit.cells) {
            if (candidates[cell] & bit) {
              positions.push(cell)
              // Equal/larger branches cannot beat the current MRV choice; no random calls
              // or tie ordering change when their remaining positions are skipped.
              if (positions.length >= assignments.length) {
                break
              }
            }
          }

          if (positions.length === 0) {
            return false
          }
          if (positions.length < assignments.length) {
            assignments = positions.map((cell) => ({ cell, digit }))
          }
        }
      }
    }

    // Retain ascending MRV ties and one shuffle per visited node across mask updates.
    for (const { cell, digit } of shuffle(assignments, random)) {
      assign(cell, digit)
      if (visit()) {
        return true
      }

      assign(cell, 0)
      if (exhausted || attemptExhausted) {
        return false
      }
    }

    return false
  }

  if (regional) {
    // Any full unit can be relabelled to this permutation, so fixing it removes only
    // digit-label symmetry. It does not exclude regional solution families.
    const digits = shuffle(DIGITS, random)
    const unit = context.units[0]

    for (let index = 0; index < unit.cells.length; index++) {
      if (!consumeWork(budget)) {
        return { status: 'budget-exhausted' }
      }

      assign(unit.cells[index], digits[index])
    }
  }

  if (visit()) {
    return { status: 'ready', solution: [...board] }
  }
  if (attemptExhausted) {
    // A slow terminal must leave aggregate allowance for a different regional layout.
    return { status: 'attempt-exhausted' }
  }

  return exhausted
    ? { status: 'budget-exhausted' }
    : { status: 'failed', reason: 'No complete terminal satisfies these units' }
}
