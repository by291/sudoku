import type { Board, ParseResult } from '@/core/sudoku/types'
import type { GenerationInput, Puzzle } from '@/core/sudoku/generation'
import type { HintResult } from '@/core/sudoku/hint'
import { parseGenerationInput, parsePuzzle } from '@/core/sudoku/generation'
import { parseBoard, isComplete } from '@/core/sudoku/board'
import { isRecord } from '@/core/sudoku/types'
import { compileRules, parseRules } from '@/core/sudoku/rules'
import type { PuzzleRules } from '@/core/sudoku/rules'
import { parseHint } from '@/worker/hintEvidence'

export { validateHintEvidence } from '@/worker/hintEvidence'

export type WorkerOutcome<T> =
  | { status: 'completed'; value: T }
  | { status: 'cancelled' }
  | { status: 'timed-out' }
  | { status: 'budget-exhausted'; message: string }
  | { status: 'failed'; message: string }

export type WorkerRequest =
  | { kind: 'generate'; requestId: string; input: GenerationInput }
  | { kind: 'hint'; requestId: string; board: Board; solution: Board; rules: PuzzleRules }

export type WorkerResponse =
  | { kind: 'generate'; requestId: string; outcome: WorkerOutcome<Puzzle> }
  | { kind: 'hint'; requestId: string; outcome: WorkerOutcome<HintResult> }

export function parseWorkerRequest(value: unknown): ParseResult<WorkerRequest> {
  if (!isRecord(value) || typeof value.requestId !== 'string' || !value.requestId) {
    return { valid: false, issues: ['Invalid request envelope'] }
  }

  if (value.kind === 'generate' && isRecord(value.input)) {
    const input = parseGenerationInput(value.input)
    if (input.valid) {
      return {
        valid: true,
        value: {
          kind: 'generate',
          requestId: value.requestId,
          input: input.value,
        },
      }
    }
  }

  if (value.kind === 'hint') {
    const board = parseBoard(value.board)
    const solution = parseBoard(value.solution)
    const rules = parseRules(value.rules)
    if (
      board.valid &&
      solution.valid &&
      rules.valid &&
      isComplete(solution.value, compileRules(rules.value))
    ) {
      return {
        valid: true,
        value: {
          kind: 'hint',
          requestId: value.requestId,
          board: board.value,
          solution: solution.value,
          rules: rules.value,
        },
      }
    }
  }

  return { valid: false, issues: ['Invalid request payload'] }
}

export function parseWorkerResponse(value: unknown): ParseResult<WorkerResponse> {
  const invalid: ParseResult<WorkerResponse> = { valid: false, issues: ['Invalid worker response'] }
  if (
    !isRecord(value) ||
    typeof value.requestId !== 'string' ||
    (value.kind !== 'generate' && value.kind !== 'hint') ||
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
    const parsed = parsePuzzle(outcome.value)

    return parsed.valid
      ? {
          valid: true,
          value: { kind, requestId, outcome: { status: 'completed', value: parsed.value } },
        }
      : invalid
  }

  const hint = parseHint(outcome.value)

  return hint
    ? { valid: true, value: { kind, requestId, outcome: { status: 'completed', value: hint } } }
    : invalid
}
