import { getConstraintSupport } from '@/core/sudoku/constraints/support'
import type { PreparedConstraintSupport } from '@/core/sudoku/constraints/types'
import { calculateBaseCandidates } from '@/core/sudoku/board'
import { consumeWork } from '@/core/sudoku/budget'
import type { WorkBudget } from '@/core/sudoku/budget'
import { constraintCells, satisfiesConstraint } from '@/core/sudoku/rules/context'
import type { RuleConstraint, RuleContext } from '@/core/sudoku/rules/types'
import type { Board } from '@/core/sudoku/types'

export type RuleViolation = { constraintId: string; cells: readonly number[]; message: string }

export type ConflictResult = {
  status: 'complete' | 'budget-exhausted'
  violations: readonly RuleViolation[]
}

export function constraintMessage(constraint: RuleConstraint): string {
  if (constraint.kind === 'cage') {
    return `第${constraint.index + 1}个笼内数字不能重复，总和必须为${constraint.sum}。`
  }

  if (constraint.kind === 'thermo') {
    return `第${constraint.index + 1}支温度计的数字必须从圆头开始严格递增。`
  }

  return `第${constraint.index + 1}条箭头上的数字总和必须等于圆圈内数字。`
}

export function evaluateConflicts(
  board: Board,
  context: RuleContext,
  budget: WorkBudget,
  support?: PreparedConstraintSupport,
): ConflictResult {
  const violations: RuleViolation[] = []
  const groups = context.units.map((unit) => ({
    id: `${unit.kind}:${unit.index}`,
    cells: unit.cells,
  }))

  for (const constraint of context.constraints) {
    if (constraint.kind === 'cage') {
      groups.push({ id: constraint.id, cells: constraint.cells })
    }
  }

  for (const group of groups) {
    const duplicates = group.cells.filter(
      (cell) =>
        board[cell] !== 0 &&
        group.cells.some((other) => other !== cell && board[other] === board[cell]),
    )
    if (duplicates.length) {
      violations.push({
        constraintId: group.id,
        cells: duplicates,
        message: '同一行、列、宫、区域、对角线或笼中的数字不能重复。',
      })
    }
  }

  const candidates = calculateBaseCandidates(board, context)

  for (const constraint of context.constraints) {
    const cells = constraintCells(constraint)
    if (cells.every((cell) => board[cell] !== 0)) {
      if (!satisfiesConstraint(board, constraint)) {
        violations.push({
          constraintId: constraint.id,
          cells,
          message: constraintMessage(constraint),
        })
      }

      continue
    }

    if (!consumeWork(budget)) {
      return { status: 'budget-exhausted', violations }
    }

    const localSupport = support
      ? support.get(board, candidates, constraint, budget)
      : getConstraintSupport(board, candidates, context, constraint, budget)
    if (localSupport.status === 'budget-exhausted') {
      return { status: 'budget-exhausted', violations }
    }

    if (localSupport.supports.some((mask) => mask === 0)) {
      violations.push({
        constraintId: constraint.id,
        cells,
        message: constraintMessage(constraint),
      })
    }
  }

  return { status: 'complete', violations }
}
