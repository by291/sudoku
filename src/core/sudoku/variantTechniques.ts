import { digitsIn, maskOf } from '@/core/sudoku/board'
import { consumeWork } from '@/core/sudoku/budget'
import type { WorkBudget } from '@/core/sudoku/budget'
import { getConstraintSupport } from '@/core/sudoku/constraintSupport'
import type { ConstraintSupport } from '@/core/sudoku/constraintSupport'
import { constraintCells } from '@/core/sudoku/rules'
import type { RuleConstraint, RuleContext } from '@/core/sudoku/rules'
import { DIGITS, isDigit } from '@/core/sudoku/types'
import type { NoteMask } from '@/core/sudoku/types'
import type { LogicalState, LogicalStep, RuleEvidence, Technique } from '@/core/sudoku/techniques'
import { matchesRuleTechnique } from '@/core/sudoku/techniques'

export type StepOutcome =
  { status: 'complete'; step: LogicalStep | null } | { status: 'budget-exhausted' }

function combinationSupport(
  state: LogicalState,
  context: RuleContext,
  constraint: RuleConstraint,
  budget: WorkBudget,
): ConstraintSupport {
  const memo = state.cageSupportMemo
  if (constraint.kind !== 'cage' || !memo) {
    return state.support
      ? state.support.get(state.board, state.candidates, constraint, budget)
      : getConstraintSupport(state.board, state.candidates, context, constraint, budget)
  }

  const cells = constraint.cells
  const domains = cells.map((cell) =>
    state.board[cell] === 0 ? state.candidates[cell] : maskOf(state.board[cell]),
  )
  const previous = memo.get(constraint)
  // The caller charges each constraint visit. Only unchanged, complete enumeration
  // is avoided; compiled peer relationships are read-only within this workspace.
  if (
    previous?.context === context &&
    previous.sum === constraint.sum &&
    previous.cells.length === cells.length &&
    cells.every(
      (cell, index) => cell === previous.cells[index] && domains[index] === previous.domains[index],
    )
  ) {
    return { status: 'complete', cells: [...previous.cells], supports: [...previous.supports] }
  }

  const support = state.support
    ? state.support.get(state.board, state.candidates, constraint, budget)
    : getConstraintSupport(state.board, state.candidates, context, constraint, budget)
  if (support.status === 'complete') {
    // One owned snapshot per cage bounds memory; partial support is never a proof.
    memo.set(constraint, {
      context,
      sum: constraint.sum,
      cells: [...cells],
      domains,
      supports: [...support.supports],
    })
  }

  return support
}

function deduction(
  state: LogicalState,
  technique: Technique,
  cells: readonly number[],
  supported: readonly NoteMask[],
  evidence: RuleEvidence,
): LogicalStep | null {
  const removals: { cell: number; digit: (typeof DIGITS)[number] }[] = []

  for (let index = 0; index < cells.length; index++) {
    const cell = cells[index]
    if (state.board[cell] !== 0) {
      continue
    }

    const before = state.candidates[cell]
    const remaining = digitsIn(before & supported[index])
    if (remaining.length === 1 && before !== (before & supported[index])) {
      return { kind: 'placement', technique, evidence, cell, digit: remaining[0] }
    }

    for (const digit of digitsIn(before & ~supported[index])) {
      removals.push({ cell, digit })
    }
  }

  return removals.length ? { kind: 'elimination', technique, evidence, removals } : null
}

function clueEvidence(state: LogicalState, constraint: RuleConstraint): RuleEvidence {
  // Returned traces can outlive or be edited independently of a prepared rule context.
  // Own geometry and digit arrays so evidence cannot corrupt later deductions.
  const cells = [...constraintCells(constraint)]
  const shared = { constraintId: constraint.id, cells, digits: [...DIGITS] }
  const domains = cells.map((cell) => ({
    cell,
    mask: state.board[cell] === 0 ? state.candidates[cell] : maskOf(state.board[cell]),
  }))
  if (constraint.kind === 'cage') {
    return { ...shared, kind: 'cage', sum: constraint.sum, domains }
  }

  if (constraint.kind === 'arrow') {
    return {
      ...shared,
      kind: 'arrow',
      circle: constraint.circle,
      shaft: [...constraint.shaft],
      domains,
    }
  }

  return { ...shared, kind: 'thermo', path: cells, bounds: [] }
}

function simpleStep(
  state: LogicalState,
  constraint: RuleConstraint,
  technique: Technique,
): LogicalStep | null {
  const cells = constraintCells(constraint)
  const evidence = clueEvidence(state, constraint)
  if (technique === 'thermo-bound' && constraint.kind === 'thermo' && evidence.kind === 'thermo') {
    const supported = constraint.cells.map((cell, position) => {
      let minimum = position + 1
      let maximum = 9 - (constraint.cells.length - position - 1)
      constraint.cells.forEach((other, index) => {
        if (state.board[other] === 0 || index === position) {
          return
        }

        if (index < position) {
          minimum = Math.max(minimum, state.board[other] + position - index)
        } else {
          maximum = Math.min(maximum, state.board[other] - (index - position))
        }
      })

      return DIGITS.filter((digit) => digit >= minimum && digit <= maximum).reduce(
        (mask, digit) => mask | maskOf(digit),
        0,
      )
    })
    evidence.bounds = cells.flatMap((cell, index) => {
      const values = digitsIn(supported[index])

      return values.length ? [{ cell, min: values[0], max: values[values.length - 1] }] : []
    })

    return deduction(state, technique, cells, supported, evidence)
  }

  if (technique === 'cage-distinct' && constraint.kind === 'cage') {
    const used = cells.reduce(
      (mask, cell) => (state.board[cell] === 0 ? mask : mask | maskOf(state.board[cell])),
      0,
    )

    return deduction(
      state,
      technique,
      cells,
      cells.map(() => ~used),
      evidence,
    )
  }

  if (
    (technique === 'cage-remainder' && constraint.kind === 'cage') ||
    (technique === 'arrow-equation' && constraint.kind === 'arrow')
  ) {
    const unknown = cells.filter((cell) => state.board[cell] === 0)
    if (unknown.length !== 1) {
      return null
    }

    const cell = unknown[0]
    const total = cells.reduce((sum, current) => sum + state.board[current], 0)
    let answer: number

    if (constraint.kind === 'cage') {
      answer = constraint.sum - total
    } else if (cell === constraint.circle) {
      answer = total
    } else {
      // total includes the circle and known shaft digits; subtract only the known shaft sum.
      const knownShaftSum = total - state.board[constraint.circle]
      answer = state.board[constraint.circle] - knownShaftSum
    }
    if (!isDigit(answer) || !(state.candidates[cell] & maskOf(answer))) {
      return null
    }

    return { kind: 'placement', technique, evidence, cell, digit: answer }
  }

  return null
}

export function findVariantStep(
  state: LogicalState,
  context: RuleContext,
  techniques: readonly Technique[],
  budget: WorkBudget,
): StepOutcome {
  for (const technique of techniques) {
    for (const constraint of context.constraints) {
      const matches = matchesRuleTechnique(technique, constraint.kind)
      if (!matches || constraintCells(constraint).every((cell) => state.board[cell] !== 0)) {
        continue
      }

      if (!consumeWork(budget)) {
        return { status: 'budget-exhausted' }
      }

      const simple = simpleStep(state, constraint, technique)
      if (simple) {
        return { status: 'complete', step: simple }
      }

      if (technique !== 'cage-combination' && technique !== 'arrow-combination') {
        continue
      }

      const support = combinationSupport(state, context, constraint, budget)
      if (support.status === 'budget-exhausted') {
        return support
      }

      const step = deduction(
        state,
        technique,
        support.cells,
        support.supports,
        clueEvidence(state, constraint),
      )
      if (step) {
        return { status: 'complete', step }
      }
    }
  }

  return { status: 'complete', step: null }
}
