import {
  calculateBaseCandidates,
  digitsIn,
  isComplete,
  maskOf,
  PEERS,
  UNITS,
} from '@/core/sudoku/board'
import type { SudokuUnit } from '@/core/sudoku/rules/types'
import { DIGITS } from '@/core/sudoku/types'
import type { Board, CellValue, Digit, NoteMask } from '@/core/sudoku/types'
import { ALL_CLASSIC_TECHNIQUES } from '@/core/sudoku/techniques'
import { findAdvancedStep } from '@/core/sudoku/advancedTechniques'
import type {
  LogicalState,
  LogicalStep,
  Technique,
  BasicClassicTechnique,
  RuleEvidence,
} from '@/core/sudoku/techniques'
import { isClassicTechnique, isAdvancedTechnique } from '@/core/sudoku/techniques'
import { CLASSIC_CONTEXT } from '@/core/sudoku/rules/context'
import type { RuleContext } from '@/core/sudoku/rules/types'
import { consumeWork, createWorkBudget, DEFAULT_WORK_LIMIT } from '@/core/sudoku/budget'
import type { WorkBudget } from '@/core/sudoku/budget'
import { findVariantStep } from '@/core/sudoku/variantTechniques'
import type { StepOutcome } from '@/core/sudoku/variantTechniques'
import type { CageSupportMemo, PreparedConstraintSupport } from '@/core/sudoku/constraints/types'

export type LogicalWorkspace = {
  board: CellValue[]
  candidates: NoteMask[]
  context: RuleContext
  premises: RuleEvidence[]
  support?: PreparedConstraintSupport
  cageSupportMemo: CageSupportMemo
}

export type LogicalOptions = {
  support?: PreparedConstraintSupport
  context: RuleContext
  workBudget: WorkBudget
}

export type LogicResult = {
  board: Board
  steps: readonly LogicalStep[]
} & (
  | { status: 'solved' | 'stalled' }
  | { status: 'budget-exhausted'; cause: 'work-limit' | 'logical-step-limit' }
)

export function createLogicalWorkspace(
  board: Board,
  context: RuleContext = CLASSIC_CONTEXT,
  support?: PreparedConstraintSupport,
): LogicalWorkspace {
  // Cage exclusion is emitted as an explained step, rather than hidden initialization.
  const base = context.rules.kind === 'killer' ? CLASSIC_CONTEXT : context

  return {
    board: [...board],
    candidates: [...calculateBaseCandidates(board, base)],
    context,
    support,
    premises: [],
    // Never carry deductions or support snapshots into another trial clue mask.
    cageSupportMemo: new Map(),
  }
}

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

export function findLogicalStep(
  state: LogicalWorkspace,
  allowed: readonly Technique[],
  budget: WorkBudget = createWorkBudget(DEFAULT_WORK_LIMIT),
): StepOutcome {
  const ordered =
    state.context.rules.kind === 'classic'
      ? ALL_CLASSIC_TECHNIQUES.filter((technique) => allowed.includes(technique))
      : allowed
  if (!consumeWork(budget)) {
    return { status: 'budget-exhausted' }
  }

  for (const technique of ordered) {
    if (isAdvancedTechnique(technique)) {
      const result = findAdvancedStep(state, technique, budget)
      if (result.status === 'budget-exhausted' || result.step) {
        return result
      }
    } else if (isClassicTechnique(technique)) {
      const step = detectors[technique](state)
      if (step) {
        return { status: 'complete', step }
      }
    } else {
      const result = findVariantStep(state, state.context, [technique], budget)
      if (result.status === 'budget-exhausted' || result.step) {
        return result
      }
    }
  }

  return { status: 'complete', step: null }
}

export function applyLogicalStep(state: LogicalWorkspace, step: LogicalStep): void {
  if (step.kind === 'elimination') {
    for (const removal of step.removals) {
      state.candidates[removal.cell] &= ~maskOf(removal.digit)
    }

    if (
      step.evidence.kind === 'cage' ||
      step.evidence.kind === 'thermo' ||
      step.evidence.kind === 'arrow'
    ) {
      state.premises.push(step.evidence)
    }

    return
  }

  state.board[step.cell] = step.digit
  state.candidates[step.cell] = 0
  const peers =
    state.context.rules.kind === 'classic'
      ? PEERS[step.cell]
      : [
          ...new Set(
            state.context.units
              .filter((unit) => unit.cells.includes(step.cell))
              .flatMap((unit) => unit.cells),
          ),
        ]

  for (const peer of peers) {
    state.candidates[peer] &= ~maskOf(step.digit)
  }

  state.premises = []
}

export function analyzeLogic(
  board: Board,
  allowed: readonly Technique[],
  stepBudget: number,
  options?: LogicalOptions,
): LogicResult {
  const state = createLogicalWorkspace(board, options?.context, options?.support)
  const budget = options?.workBudget ?? createWorkBudget(DEFAULT_WORK_LIMIT)

  return analyzeLogicalWorkspace(state, allowed, stepBudget, budget)
}

/**
 * Mutates a caller-owned workspace. Prior steps must describe that workspace; the step
 * limit includes them. The returned board aliases the workspace; the trace is copied.
 * Callers may resume only when technique priorities retain the prefix.
 */
export function analyzeLogicalWorkspace(
  state: LogicalWorkspace,
  allowed: readonly Technique[],
  stepBudget: number,
  budget: WorkBudget,
  previousSteps: readonly LogicalStep[] = [],
): LogicResult {
  const steps = [...previousSteps]

  while (!isComplete(state.board, state.context)) {
    if (steps.length >= stepBudget) {
      return { status: 'budget-exhausted', cause: 'logical-step-limit', board: state.board, steps }
    }

    const result = findLogicalStep(state, allowed, budget)
    if (result.status === 'budget-exhausted') {
      return { status: 'budget-exhausted', cause: 'work-limit', board: state.board, steps }
    }

    if (!result.step) {
      return { status: 'stalled', board: state.board, steps }
    }

    applyLogicalStep(state, result.step)
    steps.push(result.step)
  }

  return { status: 'solved', board: state.board, steps }
}
