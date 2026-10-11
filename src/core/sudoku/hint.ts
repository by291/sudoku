import type { Board, Digit } from './types'
import type { LogicalStep } from './techniques'
import { TECHNIQUES } from './techniques'
import { applyLogicalStep, createLogicalWorkspace, findLogicalStep } from './logic'
import { isComplete } from './board'
export type HintResult =
  | { kind: 'review-entry'; cell: number }
  | { kind: 'deduction'; steps: readonly LogicalStep[]; placement: { cell: number; digit: Digit } }
  | { kind: 'unavailable'; reason: 'complete' | 'unsupported' | 'budget-exhausted' }
export function analyzeHint(board: Board, solution: Board, stepBudget: number): HintResult {
  const incorrect = board.findIndex((value, cell) => value !== 0 && value !== solution[cell])
  if (incorrect !== -1) return { kind: 'review-entry', cell: incorrect }
  if (isComplete(board)) return { kind: 'unavailable', reason: 'complete' }
  const state = createLogicalWorkspace(board)
  const steps: LogicalStep[] = []
  for (let index = 0; index < stepBudget; index++) {
    const step = findLogicalStep(state, TECHNIQUES)
    if (!step) return { kind: 'unavailable', reason: 'unsupported' }
    steps.push(step)
    if (step.kind === 'placement')
      return { kind: 'deduction', steps, placement: { cell: step.cell, digit: step.digit } }
    applyLogicalStep(state, step)
  }
  return { kind: 'unavailable', reason: 'budget-exhausted' }
}
