import type {
  ConflictComputationDto,
  EditComputationDto,
  Board,
  ParseResult,
} from '@/sudoku/contracts'
import type { Puzzle } from '@/sudoku/contracts'
import type { HintResult } from '@/sudoku/contracts'
import type { PuzzleRules } from '@/sudoku/contracts'
import type { AssessmentInput, LiveAssessmentOutcome, PuzzleAssessment } from '@/sudoku/contracts'
import type { MainSudokuEngine } from '@/sudoku/mainEngine'
import { ALL_DIGITS_MASK, BOARD_SIZE, isBoard, isDenseArrayOf, isRecord } from '@/sudoku/values'
import { isRulesShape, MAX_LOGICAL_STEPS, RATING_VERSION } from '@/sudoku/guards'
import { parseGenerationInput } from '@/sudoku/generationInput'
import type { GenerationInput } from '@/sudoku/generationInput'
import { validatePuzzleSnapshot } from '@/sudoku/puzzleSnapshot'

export type WorkerOutcome<T> =
  | { status: 'completed'; value: T }
  | { status: 'cancelled' }
  | { status: 'timed-out' }
  | { status: 'incomplete'; message: string }
  | { status: 'failed'; message: string }

export type GenerateNotesInput = {
  givens: Board
  entries: Board
  notes: readonly number[]
  rules: PuzzleRules
}
export type LiveComputation<T> = { computation: T }

export type WorkerRequest =
  | { kind: 'conflicts'; requestId: string; board: Board; rules: PuzzleRules }
  | { kind: 'generate-notes'; requestId: string; input: GenerateNotesInput }
  | { kind: 'generate'; requestId: string; input: GenerationInput }
  | { kind: 'assess'; requestId: string; input: AssessmentInput }
  | { kind: 'hint'; requestId: string; board: Board; solution: Board; rules: PuzzleRules }

export type GenerateOutcome =
  | { status: 'completed'; value: Puzzle; assessment?: PuzzleAssessment }
  | Exclude<WorkerOutcome<Puzzle>, { status: 'completed' }>

export type WorkerResponse =
  | {
      kind: 'conflicts'
      requestId: string
      outcome: WorkerOutcome<LiveComputation<ConflictComputationDto>>
    }
  | {
      kind: 'generate-notes'
      requestId: string
      outcome: WorkerOutcome<LiveComputation<EditComputationDto>>
    }
  | { kind: 'generate'; requestId: string; outcome: GenerateOutcome }
  | { kind: 'assess'; requestId: string; outcome: WorkerOutcome<LiveAssessmentOutcome> }
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
  | 'validatePuzzle'
  | 'validateAssessment'
  | 'validateLiveAssessmentOutcome'
  | 'parseHint'
  | 'parseConflicts'
  | 'parseEdit'
>

function withinLimit(value: unknown, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum
}

/** Narrow an incoming Worker job and validate its semantic input through the engine. */
export function parseWorkerRequest(
  value: unknown,
  validator: RequestValidator,
): ParseResult<WorkerRequest> {
  const invalid: ParseResult<WorkerRequest> = { valid: false, issues: ['Invalid request payload'] }

  if (!isRecord(value) || typeof value.requestId !== 'string' || !value.requestId) {
    return { valid: false, issues: ['Invalid request envelope'] }
  }

  if (
    value.kind === 'conflicts' &&
    isBoard(value.board) &&
    isRulesShape(value.rules) &&
    validator.validateRules(value.rules).status === 'valid'
  ) {
    return {
      valid: true,
      value: {
        kind: 'conflicts',
        requestId: value.requestId,
        board: value.board,
        rules: value.rules,
      },
    }
  }

  if (value.kind === 'generate-notes' && isRecord(value.input)) {
    const input = value.input
    if (
      isBoard(input.givens) &&
      isBoard(input.entries) &&
      Array.isArray(input.notes) &&
      input.notes.length === BOARD_SIZE &&
      isDenseArrayOf(input.notes, (mask) => withinLimit(mask, ALL_DIGITS_MASK)) &&
      isRulesShape(input.rules) &&
      validator.validateRules(input.rules).status === 'valid'
    ) {
      return {
        valid: true,
        value: {
          kind: 'generate-notes',
          requestId: value.requestId,
          input: {
            givens: input.givens,
            entries: input.entries,
            notes: input.notes,
            rules: input.rules,
          },
        },
      }
    }

    return invalid
  }

  if (value.kind === 'generate') {
    const parsed = parseGenerationInput(value.input)
    return parsed.valid
      ? {
          valid: true,
          value: {
            kind: 'generate',
            requestId: value.requestId,
            input: parsed.value,
          },
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
      !withinLimit(input.limits.maxSteps, MAX_LOGICAL_STEPS) ||
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
          limits: { maxSteps: input.limits.maxSteps },
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
    // Check the solution independently of the player's possibly incorrect entries.
    const validated = validator.validatePuzzle({
      givens: Array(BOARD_SIZE).fill(0),
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

/** Parse a Worker outcome, checking completed payloads with the matching engine validator. */
export function parseWorkerResponse(
  value: unknown,
  validator: ResponseValidator,
): ParseResult<WorkerResponse> {
  const invalid: ParseResult<WorkerResponse> = { valid: false, issues: ['Invalid worker response'] }

  if (
    !isRecord(value) ||
    typeof value.requestId !== 'string' ||
    (value.kind !== 'generate' &&
      value.kind !== 'hint' &&
      value.kind !== 'assess' &&
      value.kind !== 'conflicts' &&
      value.kind !== 'generate-notes') ||
    !isRecord(value.outcome)
  ) {
    return invalid
  }

  const { requestId, kind, outcome } = value
  if (outcome.status === 'cancelled' || outcome.status === 'timed-out') {
    return {
      valid: true,
      value: {
        kind,
        requestId,
        outcome: { status: outcome.status },
      },
    }
  }

  if (
    (outcome.status === 'failed' || outcome.status === 'incomplete') &&
    typeof outcome.message === 'string'
  ) {
    return {
      valid: true,
      value: {
        kind,
        requestId,
        outcome: { status: outcome.status, message: outcome.message },
      },
    }
  }

  if (outcome.status !== 'completed') {
    return invalid
  }

  const response = parseCompletedResponse(
    {
      kind,
      requestId,
      outcome,
    },
    validator,
  )
  return response ? { valid: true, value: response } : invalid
}

type CompletedResponseEnvelope = {
  kind: WorkerResponse['kind']
  requestId: string
  outcome: Record<string, unknown>
}

function parseCompletedResponse(
  envelope: CompletedResponseEnvelope,
  validator: ResponseValidator,
): WorkerResponse | null {
  const { kind, requestId, outcome } = envelope

  switch (kind) {
    case 'conflicts':
    case 'generate-notes':
      return parseLiveComputation(envelope, validator)
    case 'generate':
      return parseGeneratedPuzzle(requestId, outcome, validator)
    case 'assess': {
      const parsed = validator.validateLiveAssessmentOutcome(outcome.value)
      return parsed.valid
        ? {
            kind,
            requestId,
            outcome: { status: 'completed', value: parsed.value },
          }
        : null
    }
    case 'hint': {
      const hint = validator.parseHint(outcome.value)
      return hint.status === 'valid'
        ? {
            kind,
            requestId,
            outcome: { status: 'completed', value: hint.hint },
          }
        : null
    }
  }
}

function parseLiveComputation(
  { kind, requestId, outcome }: CompletedResponseEnvelope,
  validator: ResponseValidator,
): WorkerResponse | null {
  if (!isRecord(outcome.value)) {
    return null
  }

  try {
    if (kind === 'conflicts') {
      const computation = validator.parseConflicts(outcome.value.computation)
      return {
        kind,
        requestId,
        outcome: { status: 'completed', value: { computation } },
      }
    }

    if (kind === 'generate-notes') {
      const computation = validator.parseEdit(outcome.value.computation)
      return {
        kind,
        requestId,
        outcome: { status: 'completed', value: { computation } },
      }
    }

    return null
  } catch {
    return null
  }
}

function parseGeneratedPuzzle(
  requestId: string,
  outcome: Record<string, unknown>,
  validator: ResponseValidator,
): WorkerResponse | null {
  const parsed = validatePuzzleSnapshot(outcome.value, validator)
  if (parsed.status !== 'valid') {
    return null
  }

  // Optional rating metadata belongs to the validated puzzle's variant and difficulty.
  const assessment = validator.validateAssessment({
    present: outcome.assessment !== undefined,
    value: outcome.assessment,
    identity: { variant: parsed.value.rules.kind, difficulty: parsed.value.difficulty },
  })

  return {
    kind: 'generate',
    requestId,
    outcome: {
      status: 'completed',
      value: parsed.value,
      ...(assessment.status === 'absent' ? {} : { assessment: assessment.value }),
    },
  }
}

/** Check returned hint evidence against the submitted layout and optional board. */
export function validateHintEvidence(
  hint: HintResult,
  rules: PuzzleRules,
  board: Board | undefined,
  validator: Pick<MainSudokuEngine, 'validateHint'>,
): ParseResult<HintResult> {
  const result = validator.validateHint({
    hint,
    rules,
    board,
  })

  return result.status === 'valid'
    ? { valid: true, value: result.hint }
    : { valid: false, issues: result.issues }
}
