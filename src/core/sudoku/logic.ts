import { calculateCandidates, digitsIn, isComplete, maskOf, PEERS, UNITS } from './board'
import type { SudokuUnit } from './board'
import { DIGITS } from './types'
import type { Board, CellValue, Difficulty, Digit, NoteMask } from './types'
import { TECHNIQUES } from './techniques'
import type { LogicalState, LogicalStep, Technique } from './techniques'

export type LogicalWorkspace = { board: CellValue[]; candidates: NoteMask[] }
export function createLogicalWorkspace(board: Board): LogicalWorkspace {
  return { board: [...board], candidates: [...calculateCandidates(board)] }
}
function positions(state: LogicalState, unit: SudokuUnit, digit: Digit): number[] {
  return unit.cells.filter(
    (cell) => state.board[cell] === 0 && (state.candidates[cell] & maskOf(digit)) !== 0,
  )
}
function elimination(
  technique: Technique,
  unit: SudokuUnit,
  cells: readonly number[],
  digits: readonly Digit[],
  removals: { cell: number; digit: Digit }[],
): LogicalStep | null {
  if (!removals.length) return null
  return {
    kind: 'elimination',
    technique,
    evidence: { unit: { kind: unit.kind, index: unit.index }, cells, digits },
    removals: removals.sort((a, b) => a.cell - b.cell || a.digit - b.digit),
  }
}
function nakedSingle(state: LogicalState): LogicalStep | null {
  for (const unit of UNITS)
    for (const cell of unit.cells) {
      const digits = digitsIn(state.candidates[cell])
      if (state.board[cell] === 0 && digits.length === 1)
        return {
          kind: 'placement',
          technique: 'naked-single',
          cell,
          digit: digits[0],
          evidence: { unit: { kind: unit.kind, index: unit.index }, cells: [cell], digits },
        }
    }
  return null
}
function hiddenSingle(state: LogicalState): LogicalStep | null {
  for (const unit of UNITS)
    for (const digit of DIGITS) {
      const cells = positions(state, unit, digit)
      if (cells.length === 1)
        return {
          kind: 'placement',
          technique: 'hidden-single',
          cell: cells[0],
          digit,
          evidence: { unit: { kind: unit.kind, index: unit.index }, cells, digits: [digit] },
        }
    }
  return null
}
function lockedCandidate(state: LogicalState): LogicalStep | null {
  for (const source of UNITS)
    for (const digit of DIGITS) {
      const cells = positions(state, source, digit)
      if (cells.length < 2) continue
      for (const target of UNITS) {
        if (source.kind === target.kind || (source.kind !== 'box' && target.kind !== 'box'))
          continue
        if (!cells.every((cell) => target.cells.includes(cell))) continue
        const removals = positions(state, target, digit)
          .filter((cell) => !source.cells.includes(cell))
          .map((cell) => ({ cell, digit }))
        const step = elimination('locked-candidate', source, cells, [digit], removals)
        if (step) return step
      }
    }
  return null
}
function nakedPair(state: LogicalState): LogicalStep | null {
  for (const unit of UNITS)
    for (const cell of unit.cells) {
      if (state.board[cell] !== 0) continue
      const digits = digitsIn(state.candidates[cell])
      if (digits.length !== 2) continue
      const cells = unit.cells.filter(
        (candidate) =>
          state.board[candidate] === 0 && state.candidates[candidate] === state.candidates[cell],
      )
      if (cells.length !== 2) continue
      const removals = unit.cells
        .filter((target) => !cells.includes(target))
        .flatMap((target) =>
          digits
            .filter((digit) => (state.candidates[target] & maskOf(digit)) !== 0)
            .map((digit) => ({ cell: target, digit })),
        )
      const step = elimination('naked-pair', unit, cells, digits, removals)
      if (step) return step
    }
  return null
}
function hiddenPair(state: LogicalState): LogicalStep | null {
  for (const unit of UNITS)
    for (const first of DIGITS) {
      const cells = positions(state, unit, first)
      if (cells.length !== 2) continue
      for (const second of DIGITS) {
        if (second <= first) continue
        const secondCells = positions(state, unit, second)
        if (secondCells.length !== 2 || secondCells.some((cell, index) => cell !== cells[index]))
          continue
        const removals = cells.flatMap((cell) =>
          digitsIn(state.candidates[cell])
            .filter((digit) => digit !== first && digit !== second)
            .map((digit) => ({ cell, digit })),
        )
        const step = elimination('hidden-pair', unit, cells, [first, second], removals)
        if (step) return step
      }
    }
  return null
}
const detectors: Record<Technique, (state: LogicalState) => LogicalStep | null> = {
  'naked-single': nakedSingle,
  'hidden-single': hiddenSingle,
  'locked-candidate': lockedCandidate,
  'naked-pair': nakedPair,
  'hidden-pair': hiddenPair,
}
export function findLogicalStep(
  state: LogicalState,
  allowed: readonly Technique[],
): LogicalStep | null {
  for (const technique of TECHNIQUES) {
    if (!allowed.includes(technique)) continue
    const step = detectors[technique](state)
    if (step) return step
  }
  return null
}
export function applyLogicalStep(state: LogicalWorkspace, step: LogicalStep): void {
  if (step.kind === 'elimination') {
    for (const removal of step.removals) state.candidates[removal.cell] &= ~maskOf(removal.digit)
    return
  }
  state.board[step.cell] = step.digit
  state.candidates[step.cell] = 0
  for (const peer of PEERS[step.cell]) state.candidates[peer] &= ~maskOf(step.digit)
}
export function analyzeLogic(
  board: Board,
  allowed: readonly Technique[],
  stepBudget: number,
): {
  status: 'solved' | 'stalled' | 'budget-exhausted'
  board: Board
  steps: readonly LogicalStep[]
} {
  const state = createLogicalWorkspace(board)
  const steps: LogicalStep[] = []
  while (!isComplete(state.board)) {
    if (steps.length >= stepBudget) return { status: 'budget-exhausted', board: state.board, steps }
    const step = findLogicalStep(state, allowed)
    if (!step) return { status: 'stalled', board: state.board, steps }
    applyLogicalStep(state, step)
    steps.push(step)
  }
  return { status: 'solved', board: state.board, steps }
}
export function rateDifficulty(board: Board, stepBudget: number): Difficulty | null {
  for (const [difficulty, count] of [
    ['easy', 2],
    ['medium', 3],
    ['hard', 5],
  ] satisfies [Difficulty, number][]) {
    const result = analyzeLogic(board, TECHNIQUES.slice(0, count), stepBudget)
    if (result.status === 'solved') return difficulty
    if (result.status === 'budget-exhausted') return null
  }
  return null
}
