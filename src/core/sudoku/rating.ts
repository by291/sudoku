import {
  analyzeLogicalWorkspace,
  applyLogicalStep,
  createLogicalWorkspace,
} from '@/core/sudoku/logic'
import {
  isClassicTechnique,
  isAdvancedEvidence,
  ALL_CLASSIC_TECHNIQUES,
} from '@/core/sudoku/techniques'
import { supportedDifficulties, supportsDifficulty } from '@/core/sudoku/difficulties'
import type { LogicalStep, Technique } from '@/core/sudoku/techniques'
import { RATING_POLICIES, RATING_VERSION, TECHNIQUE_TIERS } from '@/core/sudoku/ratingPolicies'
import type { RatingVersion } from '@/core/sudoku/ratingPolicies'
import type { Board, Difficulty, ParseResult } from '@/core/sudoku/types'
import { BOARD_SIZE, UNIT_SIZE, isDifficulty, isRecord } from '@/core/sudoku/types'
import type { RuleContext, PuzzleRules, SudokuVariant } from '@/core/sudoku/rules'
import { compileRules, isSudokuVariant, parseRules } from '@/core/sudoku/rules'
import { isCellIndex, maskOf, parseBoard } from '@/core/sudoku/board'
import { createWorkBudget, DEFAULT_WORK_LIMIT } from '@/core/sudoku/budget'
import type { WorkBudget } from '@/core/sudoku/budget'
import { evaluateConflicts } from '@/core/sudoku/constraints'

export type AssessmentLimits = { maxSteps: number; maxWork: number }
export type AssessmentInput = {
  board: Board
  rules: PuzzleRules
  ratingVersion: RatingVersion
  limits: AssessmentLimits
}

export type ReasoningWorkload = {
  steps: number
  placements: number
  eliminations: number
  candidateRemovals: number
  techniqueCounts: Readonly<Record<Technique, number>>
  highestTier: Difficulty | null
  highestTechnique: Technique | null
  variantSteps: number
}

export type DifficultyAssessment = {
  ratingVersion: RatingVersion
  variant: SudokuVariant
  difficulty: Difficulty
  workload: ReasoningWorkload
}

export type AssessmentOutcome =
  | { status: 'rated'; summary: DifficultyAssessment }
  | { status: 'ungraded'; ratingVersion: RatingVersion; variant: SudokuVariant }
  | {
      status: 'budget-exhausted'
      ratingVersion: RatingVersion
      variant: SudokuVariant
      stage: 'validation' | 'logic'
      difficulty: Difficulty | null
    }
  | { status: 'invalid'; issues: readonly string[] }

export type AssessmentResult =
  | { status: 'rated'; summary: DifficultyAssessment; trace: readonly LogicalStep[] }
  | Exclude<AssessmentOutcome, { status: 'rated' }>

export type RatedAssessmentResult = Extract<AssessmentResult, { status: 'rated' }>

/**
 * A rated trial owns its board and successful trace. Completion replays that trace to
 * produce full statistics without another policy search or additional charged work.
 * Changing any clue requires a new trial; candidate domains never cross boards.
 */
export type TrialAssessmentResult =
  | { status: 'rated'; difficulty: Difficulty; complete(): RatedAssessmentResult }
  | Exclude<AssessmentOutcome, { status: 'rated' }>

export type PreparedAssessment = {
  readonly context: RuleContext
  assess(board: Board, budget: WorkBudget): AssessmentResult
  screen(board: Board, budget: WorkBudget): TrialAssessmentResult
}

export type PuzzleAssessment =
  | { status: 'rated'; summary: DifficultyAssessment }
  | {
      status: 'unavailable'
      reason:
        | 'ungraded'
        | 'budget-exhausted'
        | 'invalid-input'
        | 'invalid-summary'
        | 'unsupported-version'
        | 'identity-mismatch'
      issues: readonly string[]
    }

export type AssessmentIdentity = { variant: SudokuVariant; difficulty: Difficulty }

export const DEFAULT_ASSESSMENT_LIMITS: Readonly<AssessmentLimits> = {
  maxSteps: 500,
  maxWork: DEFAULT_WORK_LIMIT * 4,
}

export function createAssessmentInput(
  board: Board,
  rules: PuzzleRules,
  limits: AssessmentLimits = DEFAULT_ASSESSMENT_LIMITS,
): AssessmentInput {
  return { board, rules, ratingVersion: RATING_VERSION, limits: { ...limits } }
}

function isWorkLimit(value: unknown, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum
}

export function parseAssessmentLimits(value: unknown): ParseResult<AssessmentLimits> {
  if (
    !isRecord(value) ||
    !isWorkLimit(value.maxSteps, DEFAULT_ASSESSMENT_LIMITS.maxSteps) ||
    !isWorkLimit(value.maxWork, DEFAULT_ASSESSMENT_LIMITS.maxWork)
  ) {
    return { valid: false, issues: ['Invalid assessment work limits'] }
  }

  return { valid: true, value: { maxSteps: value.maxSteps, maxWork: value.maxWork } }
}

export function parseAssessmentInput(value: unknown): ParseResult<AssessmentInput> {
  if (!isRecord(value) || value.ratingVersion !== RATING_VERSION) {
    return { valid: false, issues: ['Invalid assessment envelope or rating version'] }
  }

  const board = parseBoard(value.board)
  const rules = parseRules(value.rules)
  const limits = parseAssessmentLimits(value.limits)
  if (!board.valid) {
    return board
  }
  if (!rules.valid) {
    return rules
  }
  if (!limits.valid) {
    return limits
  }

  return {
    valid: true,
    value: {
      board: board.value,
      rules: rules.value,
      ratingVersion: RATING_VERSION,
      limits: limits.value,
    },
  }
}

function emptyTechniqueCounts(): Record<Technique, number> {
  return {
    'naked-single': 0,
    'hidden-single': 0,
    'locked-candidate': 0,
    'naked-pair': 0,
    'hidden-pair': 0,
    'naked-triple': 0,
    'hidden-triple': 0,
    'x-wing': 0,
    swordfish: 0,
    'xy-wing': 0,
    'simple-coloring': 0,
    'cage-distinct': 0,
    'cage-remainder': 0,
    'cage-combination': 0,
    'thermo-bound': 0,
    'arrow-equation': 0,
    'arrow-combination': 0,
  }
}

function hasVariantEvidence(step: LogicalStep): boolean {
  const evidence = step.evidence
  if (isAdvancedEvidence(evidence)) {
    return false
  }
  if (evidence.kind !== 'unit') {
    return true
  }

  return (
    evidence.premises.length > 0 ||
    evidence.unit.kind === 'region' ||
    evidence.unit.kind === 'diagonal' ||
    (evidence.units?.some((unit) => unit.kind === 'region' || unit.kind === 'diagonal') ?? false)
  )
}

/** Replay effective actions; deduction soundness remains the detector's separate responsibility. */
export function summarizeLogicalTrace(
  board: Board,
  context: RuleContext,
  steps: readonly LogicalStep[],
): ParseResult<ReasoningWorkload> {
  const state = createLogicalWorkspace(board, context)
  const techniqueCounts = emptyTechniqueCounts()
  const order = RATING_POLICIES[context.rules.kind].expert
  let placements = 0
  let eliminations = 0
  let candidateRemovals = 0
  let variantSteps = 0
  let highestTechnique: Technique | null = null

  for (const step of steps) {
    if (!order.includes(step.technique)) {
      return { valid: false, issues: ['Trace uses an inapplicable technique'] }
    }

    if (step.kind === 'placement') {
      if (
        !isCellIndex(step.cell) ||
        state.board[step.cell] !== 0 ||
        (state.candidates[step.cell] & maskOf(step.digit)) === 0
      ) {
        return { valid: false, issues: ['Trace placement does not change a supported empty cell'] }
      }

      placements++
    } else {
      const removed = new Set<string>()
      if (!step.removals.length) {
        return { valid: false, issues: ['Trace contains an empty elimination'] }
      }

      for (const { cell, digit } of step.removals) {
        const key = `${cell}:${digit}`
        if (
          !isCellIndex(cell) ||
          state.board[cell] !== 0 ||
          removed.has(key) ||
          (state.candidates[cell] & maskOf(digit)) === 0
        ) {
          return { valid: false, issues: ['Trace contains a duplicate or ineffective removal'] }
        }

        removed.add(key)
      }

      eliminations++
      candidateRemovals += removed.size
    }

    applyLogicalStep(state, step)
    techniqueCounts[step.technique]++
    if (hasVariantEvidence(step)) {
      variantSteps++
    }
    if (
      highestTechnique === null ||
      order.indexOf(step.technique) > order.indexOf(highestTechnique)
    ) {
      highestTechnique = step.technique
    }
  }

  return {
    valid: true,
    value: {
      steps: steps.length,
      placements,
      eliminations,
      candidateRemovals,
      techniqueCounts,
      highestTechnique,
      highestTier: highestTechnique === null ? null : TECHNIQUE_TIERS[highestTechnique],
      variantSteps,
    },
  }
}

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

/**
 * Owns a validated rules/limits snapshot and shares its read-only geometry across boards.
 * Each call validates/copies its board, owns fresh logical state, and charges the supplied budget.
 */
export function prepareAssessment(
  rules: PuzzleRules,
  limits: AssessmentLimits = DEFAULT_ASSESSMENT_LIMITS,
): PreparedAssessment {
  const parsedRules = parseRules(rules)
  const parsedLimits = parseAssessmentLimits(limits)
  if (!parsedRules.valid || !parsedLimits.valid) {
    const issues = [
      ...(!parsedRules.valid ? parsedRules.issues : []),
      ...(!parsedLimits.valid ? parsedLimits.issues : []),
    ]
    throw new TypeError(issues.join('; '))
  }

  // Parsing owns nested clue arrays; caller edits cannot change this prepared layout.
  const context = compileRules(parsedRules.value)
  const snapshotLimits = parsedLimits.value

  function screen(board: Board, budget: WorkBudget): TrialAssessmentResult {
    const parsedBoard = parseBoard(board)
    if (!parsedBoard.valid) {
      return { status: 'invalid', issues: parsedBoard.issues }
    }
    if (!validAssessmentBudget(budget, snapshotLimits.maxWork)) {
      return { status: 'invalid', issues: ['Invalid caller-owned assessment budget'] }
    }

    return screenSnapshot(
      {
        board: parsedBoard.value,
        rules: context.rules,
        ratingVersion: RATING_VERSION,
        limits: snapshotLimits,
      },
      budget,
      context,
    )
  }

  return {
    context,
    screen,
    assess(board, budget) {
      const result = screen(board, budget)
      return result.status === 'rated' ? result.complete() : result
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

function assessSnapshot(
  snapshot: AssessmentInput,
  budget: WorkBudget,
  context = compileRules(snapshot.rules),
): AssessmentResult {
  const result = screenSnapshot(snapshot, budget, context)
  return result.status === 'rated' ? result.complete() : result
}

function screenSnapshot(
  snapshot: AssessmentInput,
  budget: WorkBudget,
  context: RuleContext,
): TrialAssessmentResult {
  const identity = { ratingVersion: snapshot.ratingVersion, variant: snapshot.rules.kind }
  const conflicts = evaluateConflicts(snapshot.board, context, budget)
  if (conflicts.violations.length) {
    return {
      status: 'invalid',
      issues: conflicts.violations.map(
        (violation) => `${violation.constraintId}: ${violation.message}`,
      ),
    }
  }
  if (conflicts.status === 'budget-exhausted') {
    return { status: 'budget-exhausted', ...identity, stage: 'validation', difficulty: null }
  }

  let workspace = createLogicalWorkspace(snapshot.board, context)
  let previousOrder: readonly Technique[] = []
  let previousSteps: readonly LogicalStep[] = []

  for (const difficulty of supportedDifficulties(identity.variant)) {
    const policy = RATING_POLICIES[identity.variant][difficulty]
    const order =
      identity.variant === 'classic'
        ? ALL_CLASSIC_TECHNIQUES.filter((technique) => policy.includes(technique))
        : policy
    // A higher policy repeats the same deterministic deductions until its added techniques
    // become necessary. Changed priorities invalidate that prefix and require a fresh state.
    if (!previousOrder.every((technique, index) => order[index] === technique)) {
      workspace = createLogicalWorkspace(snapshot.board, context)
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
      return { status: 'budget-exhausted', ...identity, stage: 'logic', difficulty }
    }
    if (result.status === 'solved') {
      // This closure owns the board and successful trace from this screening call. A later
      // clue mask cannot reuse its domains, and final delivery still replays the full trace.
      return {
        status: 'rated',
        difficulty,
        complete() {
          const workload = summarizeLogicalTrace(snapshot.board, context, result.steps)
          if (!workload.valid) {
            throw new Error(workload.issues.join('; '))
          }

          return {
            status: 'rated',
            summary: { ...identity, difficulty, workload: workload.value },
            trace: result.steps,
          }
        },
      }
    }
    previousOrder = order
    previousSteps = result.steps
  }

  return { status: 'ungraded', ...identity }
}

export function toAssessmentOutcome(result: AssessmentResult): AssessmentOutcome {
  return result.status === 'rated' ? { status: 'rated', summary: result.summary } : result
}

function isTechnique(value: unknown): value is Technique {
  return typeof value === 'string' && Object.hasOwn(TECHNIQUE_TIERS, value)
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

const TECHNIQUE_ACTIONS = {
  'naked-single': 'placement',
  'hidden-single': 'placement',
  'locked-candidate': 'elimination',
  'naked-pair': 'elimination',
  'hidden-pair': 'elimination',
  'naked-triple': 'elimination',
  'hidden-triple': 'elimination',
  'x-wing': 'elimination',
  swordfish: 'elimination',
  'xy-wing': 'elimination',
  'simple-coloring': 'elimination',
  'cage-distinct': 'either',
  'cage-remainder': 'placement',
  'cage-combination': 'either',
  'thermo-bound': 'either',
  'arrow-equation': 'placement',
  'arrow-combination': 'either',
} as const satisfies Record<Technique, 'placement' | 'elimination' | 'either'>

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
