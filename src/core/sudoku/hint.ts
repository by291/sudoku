import type { Board, Digit } from '@/core/sudoku/types'
import type { LogicalStep } from '@/core/sudoku/logic/types'
import { ALL_CLASSIC_TECHNIQUES } from '@/core/sudoku/logic/techniques'
import { applyLogicalStep, createLogicalWorkspace } from '@/core/sudoku/logic/workspace'
import { findLogicalStep } from '@/core/sudoku/logic/solver'
import { isComplete } from '@/core/sudoku/board'
import type { LogicalOptions } from '@/core/sudoku/logic/types'
import { CLASSIC_CONTEXT } from '@/core/sudoku/rules/context'
import { createWorkBudget, DEFAULT_WORK_LIMIT } from '@/core/sudoku/budget'
import { RATING_POLICIES } from '@/core/sudoku/ratingPolicies'

export type HintResult =
  | { kind: 'review-entry'; cell: number }
  | { kind: 'deduction'; steps: readonly LogicalStep[]; placement: { cell: number; digit: Digit } }
  | { kind: 'unavailable'; reason: 'complete' | 'unsupported' | 'budget-exhausted' }

export function analyzeHint(
  board: Board,
  solution: Board,
  stepBudget: number,
  options?: LogicalOptions,
): HintResult {
  const incorrect = board.findIndex((value, cell) => value !== 0 && value !== solution[cell])
  if (incorrect !== -1) {
    return { kind: 'review-entry', cell: incorrect }
  }

  const context = options?.context ?? CLASSIC_CONTEXT
  if (isComplete(board, context)) {
    return { kind: 'unavailable', reason: 'complete' }
  }

  const state = createLogicalWorkspace(board, context)
  const budget = options?.workBudget ?? createWorkBudget(DEFAULT_WORK_LIMIT)
  const techniques =
    context.rules.kind === 'classic'
      ? ALL_CLASSIC_TECHNIQUES
      : RATING_POLICIES[context.rules.kind].hard
  const steps: LogicalStep[] = []

  for (let index = 0; index < stepBudget; index++) {
    const result = findLogicalStep(state, techniques, budget)
    if (result.status === 'budget-exhausted') {
      return { kind: 'unavailable', reason: 'budget-exhausted' }
    }

    const step = result.step
    if (!step) {
      return { kind: 'unavailable', reason: 'unsupported' }
    }

    steps.push(step)
    if (step.kind === 'placement') {
      return { kind: 'deduction', steps, placement: { cell: step.cell, digit: step.digit } }
    }

    applyLogicalStep(state, step)
  }

  return { kind: 'unavailable', reason: 'budget-exhausted' }
}
