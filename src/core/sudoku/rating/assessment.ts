import { prepareRuleComputation } from '@/core/sudoku/constraints/computation'
import type { PreparedRuleComputation } from '@/core/sudoku/constraints/types'
import { analyzeLogicalWorkspace } from '@/core/sudoku/logic/solver'
import { createLogicalWorkspace } from '@/core/sudoku/logic/workspace'
import { ALL_CLASSIC_TECHNIQUES } from '@/core/sudoku/logic/techniques'
import { copyLogicalStep } from '@/core/sudoku/logic/evidence'
import { supportedDifficulties, supportsDifficulty } from '@/core/sudoku/difficulties'
import type { LogicalStep, Technique } from '@/core/sudoku/logic/types'
import { RATING_POLICIES, RATING_VERSION } from '@/core/sudoku/rating/policies'
import type { Board, Difficulty } from '@/core/sudoku/types'
import type { PuzzleRules } from '@/core/sudoku/rules/types'
import { parseRules } from '@/core/sudoku/rules/context'
import { parseBoard } from '@/core/sudoku/board'
import { createWorkBudget, withWorkStage } from '@/core/sudoku/budget'
import type { WorkBudget } from '@/core/sudoku/budget'
import { evaluateConflicts } from '@/core/sudoku/constraints/conflicts'
import type {
  AssessmentLimits,
  AssessmentInput,
  AssessmentOutcome,
  AssessmentResult,
  RatedAssessmentResult,
  TrialAssessmentResult,
  TargetFeedback,
  PreparedAssessment,
} from '@/core/sudoku/rating/types'
import {
  DEFAULT_ASSESSMENT_LIMITS,
  parseAssessmentLimits,
  parseAssessmentInput,
} from '@/core/sudoku/rating/input'
import { summarizeLogicalTrace } from '@/core/sudoku/rating/workload'

/** Uses isolated request state and one bounded budget; does not establish uniqueness. */
export function assessPuzzle(input: AssessmentInput): AssessmentResult {
  const parsed = parseAssessmentInput(input)
  if (!parsed.valid) {
    return { status: 'invalid', issues: parsed.issues }
  }

  return assessSnapshot(parsed.value, createWorkBudget(parsed.value.limits.maxWork))
}

/** Consumes caller-owned aggregate work; never resets it between policy attempts or requests. */
export function assessPuzzleWithBudget(
  input: AssessmentInput,
  budget: WorkBudget,
): AssessmentResult {
  const parsed = parseAssessmentInput(input)
  if (!parsed.valid) {
    return { status: 'invalid', issues: parsed.issues }
  }
  if (!validAssessmentBudget(budget, parsed.value.limits.maxWork)) {
    return { status: 'invalid', issues: ['Invalid caller-owned assessment budget'] }
  }

  return assessSnapshot(parsed.value, budget)
}

/** Own validated inputs; expensive preparation is lazy and consumes the first caller's budget. */
export function prepareAssessment(
  rules: PuzzleRules,
  limits: AssessmentLimits = DEFAULT_ASSESSMENT_LIMITS,
): PreparedAssessment {
  const parsedRules = parseRules(rules)
  const parsedLimits = parseAssessmentLimits(limits)
  if (!parsedRules.valid || !parsedLimits.valid) {
    throw new TypeError('Invalid assessment preparation rules or limits')
  }

  return createAssessmentOwner(parsedRules.value, parsedLimits.value)
}

/** Reuse a layout's already charged immutable computation without rebuilding its catalogues. */
export function prepareAssessmentWithComputation(
  computation: PreparedRuleComputation,
  limits: AssessmentLimits,
): PreparedAssessment {
  const parsedLimits = parseAssessmentLimits(limits)
  if (!parsedLimits.valid) {
    throw new TypeError(parsedLimits.issues.join('; '))
  }

  return createAssessmentOwner(computation.context.rules, parsedLimits.value, computation)
}

type PolicyScreen =
  | {
      status: 'rated'
      difficulty: Difficulty
      feedback: TargetFeedback
      complete(): RatedAssessmentResult
    }
  | { status: 'target-stalled'; feedback: TargetFeedback }
  | { status: 'invalid'; issues: readonly string[] }
  | {
      status: 'budget-exhausted'
      cause: 'work-limit' | 'logical-step-limit'
      stage: 'validation' | 'logic'
      difficulty: Difficulty | null
    }

function createAssessmentOwner(
  rules: PuzzleRules,
  limits: AssessmentLimits,
  initial?: PreparedRuleComputation,
): PreparedAssessment {
  let computation = initial

  function evaluate(board: Board, budget: WorkBudget, target?: Difficulty): PolicyScreen {
    const parsedBoard = parseBoard(board)
    if (!parsedBoard.valid) {
      return { status: 'invalid', issues: parsedBoard.issues }
    }
    if (!validAssessmentBudget(budget, limits.maxWork)) {
      return { status: 'invalid', issues: ['Invalid caller-owned assessment budget'] }
    }
    if (target !== undefined && !supportsDifficulty(rules.kind, target)) {
      return { status: 'invalid', issues: ['Unsupported assessment target'] }
    }
    if (!computation) {
      const prepared = prepareRuleComputation(rules, budget)
      if (prepared.status !== 'ready') {
        return {
          status: 'budget-exhausted',
          cause: 'work-limit',
          stage: 'validation',
          difficulty: null,
        }
      }
      computation = prepared.computation
    }

    const prepared = computation
    return withWorkStage(budget, 'logic', () =>
      screenPolicies(
        {
          board: parsedBoard.value,
          rules: prepared.context.rules,
          ratingVersion: RATING_VERSION,
          limits,
        },
        budget,
        prepared,
        target,
      ),
    )
  }

  function screen(board: Board, budget: WorkBudget): TrialAssessmentResult {
    const result = evaluate(board, budget)
    if (result.status === 'target-stalled') {
      return { status: 'ungraded', ratingVersion: RATING_VERSION, variant: rules.kind }
    }
    if (result.status === 'budget-exhausted') {
      return {
        status: 'budget-exhausted',
        ratingVersion: RATING_VERSION,
        variant: rules.kind,
        stage: result.stage,
        difficulty: result.difficulty,
      }
    }
    if (result.status === 'invalid') {
      return result
    }

    return { status: 'rated', difficulty: result.difficulty, complete: result.complete }
  }

  return {
    screen,
    assess(board, budget) {
      const result = screen(board, budget)
      return result.status === 'rated' ? result.complete() : result
    },
    screenTarget(board, target, budget) {
      const result = evaluate(board, budget, target)
      if (result.status === 'rated') {
        if (result.difficulty === target) {
          return { ...result, status: 'matching-target' }
        }
        return { ...result, status: 'below-target' }
      }
      if (result.status === 'budget-exhausted') {
        return { status: 'budget-exhausted', cause: result.cause }
      }

      return result
    },
  }
}

function validAssessmentBudget(budget: WorkBudget, maxWork: number): boolean {
  return (
    Number.isSafeInteger(budget.limit) &&
    Number.isSafeInteger(budget.used) &&
    budget.limit >= 0 &&
    budget.used >= 0 &&
    budget.used <= budget.limit &&
    budget.limit <= maxWork
  )
}

function assessSnapshot(snapshot: AssessmentInput, budget: WorkBudget): AssessmentResult {
  return prepareAssessment(snapshot.rules, snapshot.limits).assess(snapshot.board, budget)
}

function screenPolicies(
  snapshot: AssessmentInput,
  budget: WorkBudget,
  computation: PreparedRuleComputation,
  target?: Difficulty,
): PolicyScreen {
  const { context, support } = computation
  const identity = { ratingVersion: snapshot.ratingVersion, variant: snapshot.rules.kind }
  const conflicts = evaluateConflicts(snapshot.board, context, budget, support)
  if (conflicts.violations.length) {
    return {
      status: 'invalid',
      issues: conflicts.violations.map(
        (violation) => `${violation.constraintId}: ${violation.message}`,
      ),
    }
  }
  if (conflicts.status === 'budget-exhausted') {
    return {
      status: 'budget-exhausted',
      cause: 'work-limit',
      stage: 'validation',
      difficulty: null,
    }
  }

  let workspace = createLogicalWorkspace(snapshot.board, context, support)
  let previousOrder: readonly Technique[] = []
  let previousSteps: readonly LogicalStep[] = []
  let feedback: TargetFeedback = {
    remainingCells: snapshot.board.filter((digit) => digit === 0).length,
    deductions: 0,
  }

  for (const difficulty of supportedDifficulties(identity.variant)) {
    const policy = RATING_POLICIES[identity.variant][difficulty]
    const order =
      identity.variant === 'classic'
        ? ALL_CLASSIC_TECHNIQUES.filter((technique) => policy.includes(technique))
        : policy
    // Only an unchanged priority prefix permits continuation; clue masks never share this workspace.
    if (!previousOrder.every((technique, index) => order[index] === technique)) {
      workspace = createLogicalWorkspace(snapshot.board, context, support)
      previousSteps = []
    }
    const result = analyzeLogicalWorkspace(
      workspace,
      policy,
      snapshot.limits.maxSteps,
      budget,
      previousSteps,
    )
    if (result.status === 'budget-exhausted') {
      return {
        status: 'budget-exhausted',
        cause: result.cause,
        stage: 'logic',
        difficulty,
      }
    }
    feedback = {
      remainingCells: result.board.filter((digit) => digit === 0).length,
      deductions: result.steps.length,
    }
    if (result.status === 'solved') {
      return {
        status: 'rated',
        difficulty,
        feedback,
        complete() {
          const workload = summarizeLogicalTrace(snapshot.board, context, result.steps)
          if (!workload.valid) {
            throw new Error(workload.issues.join('; '))
          }

          return {
            status: 'rated',
            summary: { ...identity, difficulty, workload: workload.value },
            trace: result.steps.map(copyLogicalStep),
          }
        },
      }
    }
    if (difficulty === target) {
      break
    }
    previousOrder = order
    previousSteps = result.steps
  }

  return { status: 'target-stalled', feedback }
}

export function toAssessmentOutcome(result: AssessmentResult): AssessmentOutcome {
  return result.status === 'rated' ? { status: 'rated', summary: result.summary } : result
}
