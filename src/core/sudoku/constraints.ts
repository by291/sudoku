import { calculateBaseCandidates, digitsIn, maskOf } from '@/core/sudoku/board'
import { consumeWork } from '@/core/sudoku/budget'
import type { WorkBudget } from '@/core/sudoku/budget'
import { constraintCells, satisfiesConstraint } from '@/core/sudoku/rules'
import type { RuleConstraint, RuleContext } from '@/core/sudoku/rules'
import type { Board, Digit, NoteMask } from '@/core/sudoku/types'

export type CandidateResult =
  { status: 'complete'; candidates: readonly NoteMask[] } | { status: 'budget-exhausted' }
export type RuleViolation = { constraintId: string; cells: readonly number[]; message: string }
export type ConflictResult = {
  status: 'complete' | 'budget-exhausted'
  violations: readonly RuleViolation[]
}
export type ConstraintSupport =
  | { status: 'complete'; cells: readonly number[]; supports: readonly NoteMask[] }
  | { status: 'budget-exhausted' }

// Local support is a proof of possibility only within this clue and duplicate peers.
// Unsupported values can be removed; exhaustion cannot prove an unsupported value.
export function getConstraintSupport(
  board: Board,
  candidates: readonly NoteMask[],
  context: RuleContext,
  constraint: RuleConstraint,
  budget: WorkBudget,
): ConstraintSupport {
  const cells = constraintCells(constraint)
  const domains = cells.map((cell) =>
    board[cell] === 0 ? digitsIn(candidates[cell]) : [board[cell]],
  )
  const supports = cells.map(() => 0)
  const assigned: Digit[] = []
  let exhausted = false
  function plausible(): boolean {
    for (let i = 0; i < assigned.length; i++) {
      for (let j = 0; j < i; j++) {
        if (assigned[i] === assigned[j] && context.duplicatePeers[cells[i]].includes(cells[j]))
          return false
      }
    }
    if (constraint.kind === 'thermo') {
      const position = assigned.length - 1
      const digit = assigned[position]
      return (
        (position === 0 || digit > assigned[position - 1]) &&
        digit <= 9 - (cells.length - assigned.length)
      )
    }
    const start = constraint.kind === 'arrow' ? 1 : 0
    const target = constraint.kind === 'arrow' ? assigned[0] : constraint.sum
    let minimum = assigned.slice(start).reduce((sum, digit) => sum + digit, 0)
    let maximum = minimum
    for (let i = Math.max(start, assigned.length); i < domains.length; i++) {
      if (!domains[i].length) return false
      minimum += domains[i][0]
      maximum += domains[i][domains[i].length - 1]
    }
    return minimum <= target && maximum >= target
  }
  function visit(position: number): void {
    if (exhausted) return
    if (position === cells.length) {
      assigned.forEach((digit, index) => {
        supports[index] |= maskOf(digit)
      })
      return
    }
    for (const candidate of domains[position]) {
      if (!consumeWork(budget)) {
        exhausted = true
        return
      }
      assigned.push(candidate)
      if (plausible()) visit(position + 1)
      assigned.pop()
      if (exhausted) return
    }
  }
  visit(0)
  return exhausted ? { status: 'budget-exhausted' } : { status: 'complete', cells, supports }
}

export function evaluateCandidates(
  board: Board,
  context: RuleContext,
  budget: WorkBudget,
): CandidateResult {
  const candidates = [...calculateBaseCandidates(board, context)]
  let changed = true
  while (changed) {
    changed = false
    for (const constraint of context.constraints) {
      if (!consumeWork(budget)) return { status: 'budget-exhausted' }
      const support = getConstraintSupport(board, candidates, context, constraint, budget)
      if (support.status === 'budget-exhausted') return support
      if (support.supports.some((mask) => mask === 0))
        return { status: 'complete', candidates: candidates.map(() => 0) }
      for (let i = 0; i < support.cells.length; i++) {
        const cell = support.cells[i]
        if (board[cell] !== 0) continue
        const reduced = candidates[cell] & support.supports[i]
        if (reduced !== candidates[cell]) {
          candidates[cell] = reduced
          changed = true
        }
      }
    }
  }
  return { status: 'complete', candidates }
}
export function constraintMessage(constraint: RuleConstraint): string {
  if (constraint.kind === 'cage')
    return `第${constraint.index + 1}个笼内数字不能重复，总和必须为${constraint.sum}。`
  if (constraint.kind === 'thermo')
    return `第${constraint.index + 1}支温度计的数字必须从圆头开始严格递增。`
  return `第${constraint.index + 1}条箭头上的数字总和必须等于圆圈内数字。`
}
export function evaluateConflicts(
  board: Board,
  context: RuleContext,
  budget: WorkBudget,
): ConflictResult {
  const violations: RuleViolation[] = []
  const groups = context.units.map((unit) => ({
    id: `${unit.kind}:${unit.index}`,
    cells: unit.cells,
  }))
  for (const constraint of context.constraints)
    if (constraint.kind === 'cage') groups.push({ id: constraint.id, cells: constraint.cells })
  for (const group of groups) {
    const duplicates = group.cells.filter(
      (cell) =>
        board[cell] !== 0 &&
        group.cells.some((other) => other !== cell && board[other] === board[cell]),
    )
    if (duplicates.length)
      violations.push({
        constraintId: group.id,
        cells: duplicates,
        message: '同一行、列、宫、区域、对角线或笼中的数字不能重复。',
      })
  }
  const candidates = calculateBaseCandidates(board, context)
  for (const constraint of context.constraints) {
    const cells = constraintCells(constraint)
    if (cells.every((cell) => board[cell] !== 0)) {
      if (!satisfiesConstraint(board, constraint))
        violations.push({
          constraintId: constraint.id,
          cells,
          message: constraintMessage(constraint),
        })
      continue
    }
    if (!consumeWork(budget)) return { status: 'budget-exhausted', violations }
    const support = getConstraintSupport(board, candidates, context, constraint, budget)
    if (support.status === 'budget-exhausted') return { status: 'budget-exhausted', violations }
    if (support.supports.some((mask) => mask === 0))
      violations.push({
        constraintId: constraint.id,
        cells,
        message: constraintMessage(constraint),
      })
  }
  return { status: 'complete', violations }
}
