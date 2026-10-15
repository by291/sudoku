// Own one bounded generation request. Prepared layouts and their clue frontiers retire together.
import { isComplete, parseBoard } from '@/core/sudoku/board'
import { createWorkBudget, withWorkStage } from '@/core/sudoku/budget'
import type { WorkBudget } from '@/core/sudoku/budget'
import { prepareRuleComputation } from '@/core/sudoku/constraintSupport'
import type { PreparedRuleComputation } from '@/core/sudoku/constraintSupport'
import {
  createCandidateFrontier,
  givenMask,
  materializeCandidate,
  GENERATION_SEARCH_BOUNDS,
} from '@/core/sudoku/generationCandidates'
import type { CandidateFrontier, GivenMask } from '@/core/sudoku/generationCandidates'
import { constructGenerationLayout } from '@/core/sudoku/generationLayouts'
import type {
  GenerationAttemptResult,
  GenerationInput,
  GenerationLimits,
  GenerationMetrics,
} from '@/core/sudoku/generation/types'
import { createGenerationRandom } from '@/core/sudoku/generation/random'
import { prepareAssessmentWithComputation } from '@/core/sudoku/rating'
import type { PreparedAssessment, TargetScreenResult } from '@/core/sudoku/rating'
import { RATING_VERSION } from '@/core/sudoku/ratingPolicies'
import { parseRules } from '@/core/sudoku/rules'
import { prepareExactValidator } from '@/core/sudoku/search'
import type { PreparedExactValidator } from '@/core/sudoku/search'
import type { Board } from '@/core/sudoku/types'
import { variantRulesMatter } from '@/core/sudoku/variantGeneration'

const CLUE_TARGETS = { easy: 36, medium: 32, hard: 30, expert: 28 } as const
const TIER_ORDER = { easy: 0, medium: 1, hard: 2, expert: 3 } as const

export type PreparedLayout = {
  id: number
  terminal: Board
  computation: PreparedRuleComputation
  assessor: PreparedAssessment
  validator: PreparedExactValidator
  frontier: CandidateFrontier
}

type ActiveLayout = PreparedLayout & {
  visits: number
  expandedAt: number
  workUsed: number
  bestTier: number
  bestProgress: number
}

type CandidateEvaluation =
  | { status: 'continue'; improved: boolean; stepLimited: boolean; screened: boolean }
  | Exclude<GenerationAttemptResult, { status: 'budget-exhausted' }>
  | { status: 'work-limit' }

function screeningFirst(input: GenerationInput): boolean {
  return input.variant === 'killer' && input.difficulty === 'hard'
}

function acceptedCandidate(
  layout: PreparedLayout,
  board: Board,
  trial: Extract<TargetScreenResult, { status: 'matching-target' }>,
  input: GenerationInput,
  budget: WorkBudget,
): GenerationAttemptResult | { status: 'rejected' } {
  const { context } = layout.computation
  if (
    input.variant === 'classic' &&
    board.filter(Boolean).length > CLUE_TARGETS[input.difficulty]
  ) {
    return { status: 'rejected' }
  }
  if (
    context.rules.kind !== input.variant ||
    !parseBoard(board).valid ||
    board.some((digit, cell) => digit !== 0 && digit !== layout.terminal[cell]) ||
    !isComplete(layout.terminal, context)
  ) {
    return { status: 'failed', reason: 'Invalid constructed puzzle identity or terminal' }
  }
  const completed = trial.complete()
  if (
    completed.summary.ratingVersion !== RATING_VERSION ||
    completed.summary.variant !== input.variant ||
    completed.summary.difficulty !== input.difficulty
  ) {
    return { status: 'failed', reason: 'Accepted assessment identity does not match the request' }
  }
  const exact = layout.validator.count(board, budget, budget.limit - budget.used)
  if (exact.status !== 'complete') {
    return { status: 'budget-exhausted', stage: 'construction', cause: 'work-limit' }
  }
  if (
    exact.count === 0 ||
    (exact.count === 1 &&
      (!exact.solution || exact.solution.some((digit, cell) => digit !== layout.terminal[cell])))
  ) {
    return { status: 'failed', reason: 'Constructed terminal lost its known solution' }
  }
  if (exact.count !== 1) {
    return { status: 'rejected' }
  }
  const rules = parseRules(context.rules)
  if (!rules.valid) {
    return { status: 'failed', reason: rules.issues.join('; ') }
  }
  const puzzle = {
    rules: rules.value,
    solution: [...layout.terminal],
    givens: [...board],
    difficulty: input.difficulty,
    seed: input.seed,
    puzzleVersion: input.puzzleVersion,
  }
  if (input.variant !== 'classic') {
    const necessity = variantRulesMatter(puzzle, budget)
    if (necessity.status !== 'complete') {
      return { status: 'budget-exhausted', stage: 'construction', cause: 'work-limit' }
    }
    if (!necessity.matters) {
      return { status: 'rejected' }
    }
  }

  return {
    status: 'ready',
    source: 'generated',
    puzzle,
    assessment: {
      ...completed.summary,
      workload: {
        ...completed.summary.workload,
        techniqueCounts: { ...completed.summary.workload.techniqueCounts },
      },
    },
  }
}

function evaluateCandidate(
  layout: ActiveLayout,
  mask: GivenMask,
  input: GenerationInput,
  budget: WorkBudget,
): CandidateEvaluation {
  const board = materializeCandidate(layout.terminal, mask)
  let exact: 'unchecked' | 'unique' = 'unchecked'
  if (!screeningFirst(input)) {
    const result = layout.validator.count(board, budget, budget.limit - budget.used)
    if (result.status !== 'complete') {
      return { status: 'work-limit' }
    }
    if (result.count === 0) {
      return { status: 'failed', reason: 'Constructed terminal lost its known solution' }
    }
    if (result.count !== 1) {
      return { status: 'continue', improved: false, stepLimited: false, screened: false }
    }
    exact = 'unique'
  }
  const trial = layout.assessor.screenTarget(board, input.difficulty, budget)
  if (trial.status === 'invalid') {
    return { status: 'failed', reason: trial.issues.join('; ') }
  }
  if (trial.status === 'budget-exhausted') {
    return trial.cause === 'work-limit'
      ? { status: 'work-limit' }
      : { status: 'continue', improved: false, stepLimited: true, screened: true }
  }
  const identity = { layoutId: layout.id, mask, feedback: trial.feedback }
  let improved: boolean
  if (trial.status === 'target-stalled') {
    improved = layout.frontier.retain({
      ...identity,
      kind: 'stalled',
      exact: exact === 'unique' ? 'unique' : 'unknown',
    })
  } else {
    improved = layout.frontier.retain({
      ...identity,
      kind: 'solved',
      difficulty: trial.difficulty,
      exact,
    })
    const tier = TIER_ORDER[trial.difficulty]
    const progress = board.filter((digit) => digit === 0).length
    if (tier > layout.bestTier || (tier === layout.bestTier && progress > layout.bestProgress)) {
      layout.bestTier = tier
      layout.bestProgress = progress
    }
    const meetsCluePolicy =
      input.variant !== 'classic' || board.filter(Boolean).length <= CLUE_TARGETS[input.difficulty]
    if (trial.status === 'matching-target' && meetsCluePolicy) {
      const accepted = acceptedCandidate(layout, board, trial, input, budget)
      if (accepted.status === 'budget-exhausted') {
        return { status: 'work-limit' }
      }
      if (accepted.status !== 'rejected') {
        return accepted
      }
    }
  }

  return { status: 'continue', improved, stepLimited: false, screened: true }
}

function compareLayouts(left: ActiveLayout, right: ActiveLayout): number {
  return (
    left.bestTier - right.bestTier || left.bestProgress - right.bestProgress || right.id - left.id
  )
}

export function searchGeneration(
  input: GenerationInput,
  limits: GenerationLimits,
  metrics: GenerationMetrics,
): GenerationAttemptResult {
  const budget = createWorkBudget(limits.maxWork)
  budget.accounting = { stage: 'preparation', byStage: metrics.workByStage }
  const active: ActiveLayout[] = []
  let expansionRequestedBy: ActiveLayout | null = null
  let logicalScreens = 0
  let stepLimitedScreens = 0
  let workExhausted = false

  try {
    while (budget.used < budget.limit) {
      for (let index = active.length - 1; index >= 0; index--) {
        if (active[index].frontier.exhausted) {
          if (expansionRequestedBy === active[index]) {
            expansionRequestedBy = null
          }
          active.splice(index, 1)
        }
      }
      // Eligibility does not preempt another layout that is still improving.
      const canExpand =
        expansionRequestedBy !== null &&
        (active.length < GENERATION_SEARCH_BOUNDS.activeLayouts ||
          active.every((layout) => layout.frontier.stagnant))
      if ((active.length === 0 || canExpand) && metrics.layouts < limits.maxLayouts) {
        // Retire the least promising owner before preparing another, so only two stay live.
        if (active.length >= GENERATION_SEARCH_BOUNDS.activeLayouts) {
          active.sort(compareLayouts)
          const retired = active.shift()
          if (retired === expansionRequestedBy) {
            expansionRequestedBy = null
          }
        }
        // A failed terminal or geometry still consumes its attempt; clue edits do not.
        const layoutWorkStarted = budget.used
        const id = metrics.layouts++
        const result = withWorkStage(budget, 'preparation', () =>
          constructGenerationLayout(
            input,
            {
              terminal: createGenerationRandom(input, 'terminal', id),
              geometry: createGenerationRandom(input, 'geometry', id),
            },
            budget,
          ),
        )
        if (result.status === 'budget-exhausted') {
          workExhausted = true
          break
        }
        if (result.status === 'failed') {
          return result
        }
        if (result.status === 'attempt-exhausted') {
          continue
        }
        const prepared = prepareRuleComputation(result.rules, budget)
        if (prepared.status !== 'ready') {
          workExhausted = true
          break
        }
        if (
          result.rules.kind !== input.variant ||
          !isComplete(result.terminal, prepared.computation.context)
        ) {
          return { status: 'failed', reason: 'Constructed layout has an invalid terminal' }
        }
        const terminal = Object.freeze([...result.terminal])
        const frontier = createCandidateFrontier(id, terminal, input.difficulty)
        frontier.retain({
          layoutId: id,
          mask: givenMask(terminal),
          kind: 'solved',
          difficulty: 'easy',
          feedback: { remainingCells: 0, deductions: 0 },
          exact: 'unchecked',
        })
        const layout: ActiveLayout = {
          id,
          terminal,
          frontier,
          computation: prepared.computation,
          assessor: prepareAssessmentWithComputation(prepared.computation, {
            maxSteps: limits.maxSteps,
            maxWork: budget.limit,
          }),
          validator: prepareExactValidator(prepared.computation),
          visits: 0,
          expandedAt: 0,
          workUsed: budget.used - layoutWorkStarted,
          bestTier: 0,
          bestProgress: 0,
        }
        metrics.completedLayouts++
        if (expansionRequestedBy) {
          expansionRequestedBy.expandedAt = expansionRequestedBy.visits
          expansionRequestedBy = null
        }
        active.push(layout)
      }
      if (active.length === 0) {
        break
      }
      // Equal call counts are not equal work: a stalled arithmetic trial can be much
      // more expensive than a progressing sweep. Give the least-served owner its next turn.
      active.sort((left, right) => left.workUsed - right.workUsed || left.id - right.id)
      const layout = active[0]
      const proposalWorkStarted = budget.used
      const proposal = layout.frontier.next(
        createGenerationRandom(input, 'candidate', layout.id, layout.visits),
        budget,
      )
      layout.workUsed += budget.used - proposalWorkStarted
      if (!proposal) {
        if (budget.used >= budget.limit) {
          break
        }
        continue
      }
      layout.visits++
      metrics.candidateVisits++
      const evaluationWorkStarted = budget.used
      const result = evaluateCandidate(layout, proposal.mask, input, budget)
      layout.workUsed += budget.used - evaluationWorkStarted
      if (result.status === 'ready' || result.status === 'failed') {
        return result
      }
      if (result.status === 'work-limit') {
        workExhausted = true
        break
      }
      if (result.screened) {
        logicalScreens++
        if (result.stepLimited) {
          stepLimitedScreens++
        }
      }
      layout.frontier.recordEvaluation(result.improved)
      if (
        layout.frontier.stagnant &&
        layout.visits - layout.expandedAt >= GENERATION_SEARCH_BOUNDS.stagnation
      ) {
        expansionRequestedBy = layout
      }
    }

    let cause: 'work-limit' | 'logical-step-limit' | 'layout-limit' | 'exhausted-frontier' =
      'exhausted-frontier'
    if (workExhausted || budget.used >= budget.limit) {
      cause = 'work-limit'
    } else if (stepLimitedScreens > 0 && stepLimitedScreens === logicalScreens) {
      cause = 'logical-step-limit'
    } else if (metrics.layouts >= limits.maxLayouts) {
      cause = 'layout-limit'
    }

    return { status: 'budget-exhausted', stage: 'construction', cause }
  } finally {
    metrics.constructionWork = budget.used
  }
}
