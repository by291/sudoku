import { isComplete } from '@/core/sudoku/board'
import type { Board } from '@/core/sudoku/types'
import {
  ALL_CLASSIC_TECHNIQUES,
  isClassicTechnique,
  isAdvancedTechnique,
} from '@/core/sudoku/logic/techniques'
import { findAdvancedStep } from '@/core/sudoku/logic/advancedTechniques'
import type { LogicalStep, Technique } from '@/core/sudoku/logic/types'
import { consumeWork, createWorkBudget, DEFAULT_WORK_LIMIT } from '@/core/sudoku/budget'
import type { WorkBudget } from '@/core/sudoku/budget'
import { findVariantStep } from '@/core/sudoku/logic/variantTechniques'
import type { StepOutcome } from '@/core/sudoku/logic/types'
import type { LogicalWorkspace, LogicalOptions, LogicResult } from '@/core/sudoku/logic/types'
import { createLogicalWorkspace, applyLogicalStep } from '@/core/sudoku/logic/workspace'
import { findBasicStep } from '@/core/sudoku/logic/basicTechniques'

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
      const step = findBasicStep(state, technique)
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
