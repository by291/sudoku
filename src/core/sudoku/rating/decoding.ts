import { isClassicTechnique, TECHNIQUE_ACTIONS, isTechnique } from '@/core/sudoku/logic/techniques'
import { supportsDifficulty } from '@/core/sudoku/difficulties'
import type { Technique } from '@/core/sudoku/logic/types'
import { RATING_POLICIES, RATING_VERSION, TECHNIQUE_TIERS } from '@/core/sudoku/rating/policies'
import type { RatingVersion } from '@/core/sudoku/rating/policies'
import type { ParseResult } from '@/core/sudoku/types'
import { BOARD_SIZE, UNIT_SIZE, isDifficulty, isRecord } from '@/core/sudoku/types'
import type { SudokuVariant } from '@/core/sudoku/rules/types'
import { isSudokuVariant } from '@/core/sudoku/rules/context'
import type {
  DifficultyAssessment,
  AssessmentOutcome,
  PuzzleAssessment,
  AssessmentIdentity,
} from '@/core/sudoku/rating/types'
import { DEFAULT_ASSESSMENT_LIMITS } from '@/core/sudoku/rating/input'
import { emptyTechniqueCounts } from '@/core/sudoku/rating/workload'

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function parseIssues(value: unknown): ParseResult<readonly string[]> {
  if (!Array.isArray(value) || !value.every((issue) => typeof issue === 'string' && issue.trim())) {
    return { valid: false, issues: ['Invalid assessment issues'] }
  }

  return { valid: true, value: [...value] }
}

export function parseAssessmentSummary(value: unknown): ParseResult<DifficultyAssessment> {
  if (
    !isRecord(value) ||
    value.ratingVersion !== RATING_VERSION ||
    !isSudokuVariant(value.variant) ||
    !isDifficulty(value.difficulty) ||
    !supportsDifficulty(value.variant, value.difficulty) ||
    !isRecord(value.workload)
  ) {
    return { valid: false, issues: ['Invalid assessment summary identity'] }
  }

  const workload = value.workload
  if (
    !isCount(workload.steps) ||
    !isCount(workload.placements) ||
    !isCount(workload.eliminations) ||
    !isCount(workload.candidateRemovals) ||
    !isCount(workload.variantSteps) ||
    !isRecord(workload.techniqueCounts)
  ) {
    return { valid: false, issues: ['Invalid assessment workload counts'] }
  }

  const techniqueCounts = emptyTechniqueCounts()
  const policy = RATING_POLICIES[value.variant][value.difficulty]
  const order = RATING_POLICIES[value.variant].expert
  let total = 0
  let requiredPlacements = 0
  let requiredEliminations = 0
  let requiredVariantSteps = 0
  let highestTechnique: Technique | null = null
  if (Object.keys(workload.techniqueCounts).length !== Object.keys(techniqueCounts).length) {
    return {
      valid: false,
      issues: ['Assessment technique counts must include every known technique'],
    }
  }

  for (const key of Object.keys(workload.techniqueCounts)) {
    const count = workload.techniqueCounts[key]
    if (!isTechnique(key) || !isCount(count) || (count > 0 && !policy.includes(key))) {
      return { valid: false, issues: ['Invalid or inapplicable assessment technique count'] }
    }

    techniqueCounts[key] = count
    total += count
    if (TECHNIQUE_ACTIONS[key] === 'placement') {
      requiredPlacements += count
    } else if (TECHNIQUE_ACTIONS[key] === 'elimination') {
      requiredEliminations += count
    }
    if (!isClassicTechnique(key)) {
      requiredVariantSteps += count
    }
    if (
      count > 0 &&
      (highestTechnique === null || order.indexOf(key) > order.indexOf(highestTechnique))
    ) {
      highestTechnique = key
    }
  }

  const highestTier = highestTechnique === null ? null : TECHNIQUE_TIERS[highestTechnique]
  // Candidates are never added during replay; placements and explicit removals have finite bounds.
  if (
    workload.steps > DEFAULT_ASSESSMENT_LIMITS.maxSteps ||
    workload.placements > BOARD_SIZE ||
    workload.candidateRemovals > BOARD_SIZE * UNIT_SIZE ||
    workload.placements < requiredPlacements ||
    workload.eliminations < requiredEliminations ||
    workload.variantSteps < requiredVariantSteps ||
    (value.variant === 'classic' && workload.variantSteps !== 0) ||
    workload.steps !== workload.placements + workload.eliminations ||
    workload.steps !== total ||
    workload.candidateRemovals < workload.eliminations ||
    (workload.eliminations === 0 && workload.candidateRemovals !== 0) ||
    workload.variantSteps > workload.steps ||
    workload.highestTechnique !== highestTechnique ||
    workload.highestTier !== highestTier ||
    (highestTier === null ? value.difficulty !== 'easy' : highestTier !== value.difficulty)
  ) {
    return { valid: false, issues: ['Contradictory assessment workload'] }
  }

  return {
    valid: true,
    value: {
      ratingVersion: RATING_VERSION,
      variant: value.variant,
      difficulty: value.difficulty,
      workload: {
        steps: workload.steps,
        placements: workload.placements,
        eliminations: workload.eliminations,
        candidateRemovals: workload.candidateRemovals,
        variantSteps: workload.variantSteps,
        techniqueCounts,
        highestTechnique,
        highestTier,
      },
    },
  }
}

export function parseAssessmentOutcome(value: unknown): ParseResult<AssessmentOutcome> {
  if (!isRecord(value)) {
    return { valid: false, issues: ['Invalid assessment outcome'] }
  }
  if (value.status === 'rated') {
    const summary = parseAssessmentSummary(value.summary)
    return summary.valid
      ? { valid: true, value: { status: 'rated', summary: summary.value } }
      : summary
  }
  if (value.status === 'invalid') {
    const issues = parseIssues(value.issues)
    if (!issues.valid || issues.value.length === 0) {
      return { valid: false, issues: ['Invalid assessment failure issues'] }
    }

    return { valid: true, value: { status: 'invalid', issues: issues.value } }
  }
  if (value.ratingVersion !== RATING_VERSION || !isSudokuVariant(value.variant)) {
    return { valid: false, issues: ['Invalid assessment outcome identity'] }
  }

  const identity: { ratingVersion: RatingVersion; variant: SudokuVariant } = {
    ratingVersion: RATING_VERSION,
    variant: value.variant,
  }
  if (value.status === 'ungraded') {
    return { valid: true, value: { status: 'ungraded', ...identity } }
  }
  if (
    value.status === 'budget-exhausted' &&
    ((value.stage === 'validation' && value.difficulty === null) ||
      (value.stage === 'logic' &&
        isDifficulty(value.difficulty) &&
        supportsDifficulty(value.variant, value.difficulty)))
  ) {
    return {
      valid: true,
      value: {
        status: 'budget-exhausted',
        ...identity,
        stage: value.stage,
        difficulty: value.difficulty,
      },
    }
  }

  return { valid: false, issues: ['Invalid assessment outcome status or stage'] }
}

function isUnavailableReason(
  value: unknown,
): value is Extract<PuzzleAssessment, { status: 'unavailable' }>['reason'] {
  return (
    value === 'ungraded' ||
    value === 'budget-exhausted' ||
    value === 'invalid-input' ||
    value === 'invalid-summary' ||
    value === 'unsupported-version' ||
    value === 'identity-mismatch'
  )
}

/** Optional metadata cannot invalidate a playable puzzle or change its stored identity. */
export function decodePuzzleAssessment(
  value: unknown,
  identity: AssessmentIdentity,
): PuzzleAssessment | undefined {
  if (value === undefined) {
    return undefined
  }
  if (isRecord(value) && value.status === 'unavailable' && isUnavailableReason(value.reason)) {
    const issues = parseIssues(value.issues)
    if (issues.valid) {
      return { status: 'unavailable', reason: value.reason, issues: issues.value }
    }
  }
  if (
    isRecord(value) &&
    value.status === 'rated' &&
    isRecord(value.summary) &&
    value.summary.ratingVersion !== RATING_VERSION
  ) {
    return {
      status: 'unavailable',
      reason: 'unsupported-version',
      issues: ['Unsupported rating version'],
    }
  }

  const outcome = parseAssessmentOutcome(value)
  if (!outcome.valid || outcome.value.status !== 'rated') {
    return {
      status: 'unavailable',
      reason: 'invalid-summary',
      issues: outcome.valid ? ['Expected puzzle assessment metadata'] : outcome.issues,
    }
  }
  if (
    outcome.value.summary.variant !== identity.variant ||
    outcome.value.summary.difficulty !== identity.difficulty
  ) {
    return {
      status: 'unavailable',
      reason: 'identity-mismatch',
      issues: ['Assessment does not match puzzle type or difficulty'],
    }
  }

  return outcome.value
}

export function toPuzzleAssessment(
  result: AssessmentOutcome,
  identity: AssessmentIdentity,
): PuzzleAssessment {
  if (result.status === 'rated') {
    return (
      decodePuzzleAssessment(result, identity) ?? {
        status: 'unavailable',
        reason: 'invalid-summary',
        issues: ['Missing summary'],
      }
    )
  }
  if (result.status === 'invalid') {
    return { status: 'unavailable', reason: 'invalid-input', issues: [...result.issues] }
  }

  return { status: 'unavailable', reason: result.status, issues: [] }
}
