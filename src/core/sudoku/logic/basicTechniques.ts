import { digitsIn, maskOf, UNITS } from '@/core/sudoku/board'
import type { SudokuUnit } from '@/core/sudoku/rules/types'
import { DIGITS } from '@/core/sudoku/types'
import type { Digit } from '@/core/sudoku/types'
import type {
  LogicalState,
  LogicalStep,
  Technique,
  BasicClassicTechnique,
} from '@/core/sudoku/logic/types'

function unitsFor(state: LogicalState): readonly SudokuUnit[] {
  return state.context?.units ?? UNITS
}

function unitEvidence(
  state: LogicalState,
  unit: SudokuUnit,
  cells: readonly number[],
  digits: readonly Digit[],
): LogicalStep['evidence'] {
  return {
    kind: 'unit',
    unit: { kind: unit.kind, index: unit.index },
    cells,
    digits,
    premises: [...(state.premises ?? [])],
    units:
      state.context?.rules.kind !== 'classic'
        ? unitsFor(state)
            .filter((candidate) => cells.some((cell) => candidate.cells.includes(cell)))
            .map(({ kind, index }) => ({ kind, index }))
        : [],
  }
}

function positions(state: LogicalState, unit: SudokuUnit, digit: Digit): number[] {
  const matches: number[] = []
  const bit = maskOf(digit)
  // Prepared topology is frozen; indexed traversal avoids the generic frozen-array filter path.
  for (let index = 0; index < unit.cells.length; index++) {
    const cell = unit.cells[index]
    if (state.board[cell] === 0 && (state.candidates[cell] & bit) !== 0) {
      matches.push(cell)
    }
  }

  return matches
}

function elimination(
  state: LogicalState,
  technique: Technique,
  unit: SudokuUnit,
  cells: readonly number[],
  digits: readonly Digit[],
  removals: { cell: number; digit: Digit }[],
): LogicalStep | null {
  if (!removals.length) {
    return null
  }

  return {
    kind: 'elimination',
    technique,
    evidence: unitEvidence(state, unit, cells, digits),
    removals: removals.sort((a, b) => a.cell - b.cell || a.digit - b.digit),
  }
}

function nakedSingle(state: LogicalState): LogicalStep | null {
  for (const unit of unitsFor(state)) {
    for (const cell of unit.cells) {
      const digits = digitsIn(state.candidates[cell])
      if (state.board[cell] === 0 && digits.length === 1) {
        return {
          kind: 'placement',
          technique: 'naked-single',
          cell,
          digit: digits[0],
          evidence: unitEvidence(state, unit, [cell], digits),
        }
      }
    }
  }

  return null
}

function hiddenSingle(state: LogicalState): LogicalStep | null {
  for (const unit of unitsFor(state)) {
    for (const digit of DIGITS) {
      const cells = positions(state, unit, digit)
      if (cells.length === 1) {
        return {
          kind: 'placement',
          technique: 'hidden-single',
          cell: cells[0],
          digit,
          evidence: unitEvidence(state, unit, cells, [digit]),
        }
      }
    }
  }

  return null
}

function lockedCandidate(state: LogicalState): LogicalStep | null {
  for (const source of unitsFor(state)) {
    for (const digit of DIGITS) {
      const cells = positions(state, source, digit)
      if (cells.length < 2) {
        continue
      }

      for (const target of unitsFor(state)) {
        if (
          source === target ||
          (state.context?.rules.kind === 'classic' &&
            (source.kind === target.kind || (source.kind !== 'box' && target.kind !== 'box')))
        ) {
          continue
        }

        if (!cells.every((cell) => target.cells.includes(cell))) {
          continue
        }

        const removals = positions(state, target, digit)
          .filter((cell) => !source.cells.includes(cell))
          .map((cell) => ({ cell, digit }))
        const step = elimination(state, 'locked-candidate', source, cells, [digit], removals)
        if (step) {
          return step
        }
      }
    }
  }

  return null
}

function nakedPair(state: LogicalState): LogicalStep | null {
  for (const unit of unitsFor(state)) {
    for (const cell of unit.cells) {
      if (state.board[cell] !== 0) {
        continue
      }

      const digits = digitsIn(state.candidates[cell])
      if (digits.length !== 2) {
        continue
      }

      const cells = unit.cells.filter(
        (candidate) =>
          state.board[candidate] === 0 && state.candidates[candidate] === state.candidates[cell],
      )
      if (cells.length !== 2) {
        continue
      }

      const removals = unit.cells
        .filter((target) => !cells.includes(target))
        .flatMap((target) =>
          digits
            .filter((digit) => (state.candidates[target] & maskOf(digit)) !== 0)
            .map((digit) => ({ cell: target, digit })),
        )
      const step = elimination(state, 'naked-pair', unit, cells, digits, removals)
      if (step) {
        return step
      }
    }
  }

  return null
}

function hiddenPair(state: LogicalState): LogicalStep | null {
  for (const unit of unitsFor(state)) {
    for (const first of DIGITS) {
      const cells = positions(state, unit, first)
      if (cells.length !== 2) {
        continue
      }

      for (const second of DIGITS) {
        if (second <= first) {
          continue
        }

        const secondCells = positions(state, unit, second)
        if (secondCells.length !== 2 || secondCells.some((cell, index) => cell !== cells[index])) {
          continue
        }

        const removals = cells.flatMap((cell) =>
          digitsIn(state.candidates[cell])
            .filter((digit) => digit !== first && digit !== second)
            .map((digit) => ({ cell, digit })),
        )
        const step = elimination(state, 'hidden-pair', unit, cells, [first, second], removals)
        if (step) {
          return step
        }
      }
    }
  }

  return null
}

const detectors: Record<BasicClassicTechnique, (state: LogicalState) => LogicalStep | null> = {
  'naked-single': nakedSingle,
  'hidden-single': hiddenSingle,
  'locked-candidate': lockedCandidate,
  'naked-pair': nakedPair,
  'hidden-pair': hiddenPair,
}

export function findBasicStep(
  state: LogicalState,
  technique: BasicClassicTechnique,
): LogicalStep | null {
  return detectors[technique](state)
}
