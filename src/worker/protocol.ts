import type { Board, ParseResult } from '@/core/sudoku/types'
import type { Puzzle } from '@/core/sudoku/puzzle'
import type { HintResult } from '@/core/sudoku/hint'
import type { PuzzleRules } from '@/core/sudoku/rules/types'
import type {
  AssessmentInput,
  AssessmentOutcome,
  PuzzleAssessment,
} from '@/core/sudoku/rating/types'
import type { MainSudokuEngine } from '@/sudoku/mainEngine'
import { isBoard, isRecord, isRulesShape, RATING_VERSION } from '@/sudoku/guards'
import { parseGenerationInput } from '@/sudoku/generationInput'
import type { GenerationInput } from '@/sudoku/generationInput'
import { validatePuzzleSnapshot } from '@/sudoku/puzzleSnapshot'

export type WorkerOutcome<T> =
  | { status: 'completed'; value: T }
  | { status: 'cancelled' }
  | { status: 'timed-out' }
  | { status: 'budget-exhausted'; message: string }
  | { status: 'failed'; message: string }

export type WorkerRequest =
  | { kind: 'generate'; requestId: string; input: GenerationInput }
  | { kind: 'assess'; requestId: string; input: AssessmentInput }
  | { kind: 'hint'; requestId: string; board: Board; solution: Board; rules: PuzzleRules }

export type GenerateOutcome =
  | { status: 'completed'; value: Puzzle; assessment?: PuzzleAssessment }
  | Exclude<WorkerOutcome<Puzzle>, { status: 'completed' }>

export type WorkerResponse =
  | { kind: 'generate'; requestId: string; outcome: GenerateOutcome }
  | { kind: 'assess'; requestId: string; outcome: WorkerOutcome<AssessmentOutcome> }
  | { kind: 'hint'; requestId: string; outcome: WorkerOutcome<HintResult> }

export type WorkerInitialize = {
  kind: 'initialize'
  bridgeVersion: number
  module: WebAssembly.Module
}
export type WorkerReady = { kind: 'ready'; bridgeVersion: number }
export type WorkerInitializationFailed = { kind: 'initialization-failed'; message: string }
export type WorkerInbound = WorkerInitialize | WorkerRequest
export type WorkerControl = WorkerInitialize | WorkerReady | WorkerInitializationFailed

type RequestValidator = Pick<MainSudokuEngine, 'validateRules' | 'validatePuzzle'>
type ResponseValidator = Pick<
  MainSudokuEngine,
  'validatePuzzle' | 'validateAssessment' | 'validateAssessmentOutcome' | 'parseHint'
>

function withinLimit(value: unknown, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum
}

export function parseWorkerRequest(
  value: unknown,
  validator: RequestValidator,
): ParseResult<WorkerRequest> {
  const invalid: ParseResult<WorkerRequest> = { valid: false, issues: ['Invalid request payload'] }
  if (!isRecord(value) || typeof value.requestId !== 'string' || !value.requestId) {
    return { valid: false, issues: ['Invalid request envelope'] }
  }
  if (value.kind === 'generate') {
    const parsed = parseGenerationInput(value.input)
    return parsed.valid
      ? {
          valid: true,
          value: { kind: 'generate', requestId: value.requestId, input: parsed.value },
        }
      : parsed
  }
  if (value.kind === 'assess' && isRecord(value.input)) {
    const input = value.input
    if (
      input.ratingVersion !== RATING_VERSION ||
      !isBoard(input.board) ||
      !isRulesShape(input.rules) ||
      !isRecord(input.limits) ||
      !withinLimit(input.limits.maxSteps, 500) ||
      !withinLimit(input.limits.maxWork, 4000000) ||
      validator.validateRules(input.rules).status !== 'valid'
    ) {
      return invalid
    }
    return {
      valid: true,
      value: {
        kind: 'assess',
        requestId: value.requestId,
        input: {
          board: input.board,
          rules: input.rules,
          ratingVersion: RATING_VERSION,
          limits: { maxSteps: input.limits.maxSteps, maxWork: input.limits.maxWork },
        },
      },
    }
  }
  if (
    value.kind === 'hint' &&
    isBoard(value.board) &&
    isBoard(value.solution) &&
    isRulesShape(value.rules)
  ) {
    const validated = validator.validatePuzzle({
      givens: Array(81).fill(0),
      solution: value.solution,
      rules: value.rules,
      difficulty: 'easy',
    })
    if (validated.status === 'valid') {
      return {
        valid: true,
        value: {
          kind: 'hint',
          requestId: value.requestId,
          board: value.board,
          solution: value.solution,
          rules: value.rules,
        },
      }
    }
  }
  return invalid
}

export function parseWorkerResponse(
  value: unknown,
  validator: ResponseValidator,
): ParseResult<WorkerResponse> {
  const invalid: ParseResult<WorkerResponse> = { valid: false, issues: ['Invalid worker response'] }
  if (
    !isRecord(value) ||
    typeof value.requestId !== 'string' ||
    (value.kind !== 'generate' && value.kind !== 'hint' && value.kind !== 'assess') ||
    !isRecord(value.outcome)
  ) {
    return invalid
  }
  const { requestId, kind, outcome } = value
  if (outcome.status === 'cancelled' || outcome.status === 'timed-out') {
    return { valid: true, value: { kind, requestId, outcome: { status: outcome.status } } }
  }
  if (
    (outcome.status === 'failed' || outcome.status === 'budget-exhausted') &&
    typeof outcome.message === 'string'
  ) {
    return {
      valid: true,
      value: { kind, requestId, outcome: { status: outcome.status, message: outcome.message } },
    }
  }
  if (outcome.status !== 'completed') {
    return invalid
  }
  if (kind === 'generate') {
    const parsed = validatePuzzleSnapshot(outcome.value, validator)
    if (parsed.status !== 'valid') {
      return invalid
    }
    const assessment = validator.validateAssessment({
      present: outcome.assessment !== undefined,
      value: outcome.assessment,
      identity: { variant: parsed.value.rules.kind, difficulty: parsed.value.difficulty },
    })
    return {
      valid: true,
      value: {
        kind,
        requestId,
        outcome: {
          status: 'completed',
          value: parsed.value,
          ...(assessment.status === 'absent' ? {} : { assessment: assessment.value }),
        },
      },
    }
  }
  if (kind === 'assess') {
    const parsed = validator.validateAssessmentOutcome(outcome.value)
    return parsed.valid
      ? {
          valid: true,
          value: { kind, requestId, outcome: { status: 'completed', value: parsed.value } },
        }
      : invalid
  }
  const hint = validator.parseHint(outcome.value)
  return hint.status === 'valid'
    ? {
        valid: true,
        value: { kind, requestId, outcome: { status: 'completed', value: hint.hint } },
      }
    : invalid
}

export function validateHintEvidence(
  hint: HintResult,
  rules: PuzzleRules,
  board: Board | undefined,
  validator: Pick<MainSudokuEngine, 'validateHint'>,
): ParseResult<HintResult> {
  const result = validator.validateHint({ hint, rules, board })
  return result.status === 'valid'
    ? { valid: true, value: result.hint }
    : { valid: false, issues: result.issues }
}
