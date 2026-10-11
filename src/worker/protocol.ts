import type { Board, Digit, ParseResult } from '@/core/sudoku/types'
import type { GenerationInput, Puzzle } from '@/core/sudoku/generation'
import type { HintResult } from '@/core/sudoku/hint'
import { parsePuzzle } from '@/core/sudoku/generation'
import { parseBoard, isCellIndex, isComplete } from '@/core/sudoku/board'
import { isDifficulty, isDigit, isRecord } from '@/core/sudoku/types'
import { TECHNIQUES } from '@/core/sudoku/techniques'
import type { LogicalStep, Technique } from '@/core/sudoku/techniques'
export type WorkerOutcome<T> =
  | { status: 'completed'; value: T }
  | { status: 'cancelled' }
  | { status: 'timed-out' }
  | { status: 'budget-exhausted'; message: string }
  | { status: 'failed'; message: string }
export type WorkerRequest =
  | { kind: 'generate'; requestId: string; input: GenerationInput }
  | { kind: 'hint'; requestId: string; board: Board; solution: Board }
export type WorkerResponse =
  | { kind: 'generate'; requestId: string; outcome: WorkerOutcome<Puzzle> }
  | { kind: 'hint'; requestId: string; outcome: WorkerOutcome<HintResult> }
function isIndex(value: unknown): value is number {
  return typeof value === 'number' && isCellIndex(value)
}
function isTechnique(value: unknown): value is Technique {
  return TECHNIQUES.some((technique) => technique === value)
}
function parseStep(value: unknown): LogicalStep | null {
  if (!isRecord(value) || !isTechnique(value.technique) || !isRecord(value.evidence)) return null
  const evidence = value.evidence
  if (
    !isRecord(evidence.unit) ||
    !Number.isInteger(evidence.unit.index) ||
    typeof evidence.unit.index !== 'number' ||
    evidence.unit.index < 0 ||
    evidence.unit.index > 8
  )
    return null
  const kind = evidence.unit.kind
  if (kind !== 'row' && kind !== 'column' && kind !== 'box') return null
  if (
    !Array.isArray(evidence.cells) ||
    !evidence.cells.length ||
    !evidence.cells.every(isIndex) ||
    !Array.isArray(evidence.digits) ||
    !evidence.digits.length ||
    !evidence.digits.every(isDigit)
  )
    return null
  const common: Pick<LogicalStep, 'technique' | 'evidence'> = {
    technique: value.technique,
    evidence: {
      unit: { kind, index: evidence.unit.index },
      cells: evidence.cells,
      digits: evidence.digits,
    },
  }
  if (value.kind === 'placement' && isIndex(value.cell) && isDigit(value.digit))
    return { ...common, kind: 'placement', cell: value.cell, digit: value.digit }
  if (value.kind !== 'elimination' || !Array.isArray(value.removals) || !value.removals.length)
    return null
  const removals: { cell: number; digit: Digit }[] = []
  for (const removal of value.removals) {
    if (!isRecord(removal) || !isIndex(removal.cell) || !isDigit(removal.digit)) return null
    removals.push({ cell: removal.cell, digit: removal.digit })
  }
  return { ...common, kind: 'elimination', removals }
}
function parseHint(value: unknown): HintResult | null {
  if (!isRecord(value)) return null
  if (value.kind === 'review-entry' && isIndex(value.cell))
    return { kind: value.kind, cell: value.cell }
  if (
    value.kind === 'unavailable' &&
    (value.reason === 'complete' ||
      value.reason === 'unsupported' ||
      value.reason === 'budget-exhausted')
  )
    return { kind: value.kind, reason: value.reason }
  if (
    value.kind !== 'deduction' ||
    !Array.isArray(value.steps) ||
    !value.steps.length ||
    !isRecord(value.placement) ||
    !isIndex(value.placement.cell) ||
    !isDigit(value.placement.digit)
  )
    return null
  const steps: LogicalStep[] = []
  for (const step of value.steps) {
    const parsed = parseStep(step)
    if (!parsed) return null
    steps.push(parsed)
  }
  const final = steps.at(-1)
  if (
    !final ||
    final.kind !== 'placement' ||
    final.cell !== value.placement.cell ||
    final.digit !== value.placement.digit
  )
    return null
  return { kind: 'deduction', steps, placement: { cell: final.cell, digit: final.digit } }
}
export function parseWorkerRequest(value: unknown): ParseResult<WorkerRequest> {
  if (!isRecord(value) || typeof value.requestId !== 'string' || !value.requestId)
    return { valid: false, issues: ['Invalid request envelope'] }
  if (value.kind === 'generate' && isRecord(value.input)) {
    const input = value.input
    if (
      typeof input.seed === 'string' &&
      input.seed &&
      typeof input.puzzleVersion === 'string' &&
      input.puzzleVersion &&
      isDifficulty(input.difficulty)
    )
      return {
        valid: true,
        value: {
          kind: 'generate',
          requestId: value.requestId,
          input: {
            seed: input.seed,
            puzzleVersion: input.puzzleVersion,
            difficulty: input.difficulty,
          },
        },
      }
  }
  if (value.kind === 'hint') {
    const board = parseBoard(value.board),
      solution = parseBoard(value.solution)
    if (board.valid && solution.valid && isComplete(solution.value))
      return {
        valid: true,
        value: {
          kind: 'hint',
          requestId: value.requestId,
          board: board.value,
          solution: solution.value,
        },
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
  )
    return invalid
  const { requestId, kind, outcome } = value
  if (outcome.status === 'cancelled' || outcome.status === 'timed-out')
    return { valid: true, value: { kind, requestId, outcome: { status: outcome.status } } }
  if (
    (outcome.status === 'failed' || outcome.status === 'budget-exhausted') &&
    typeof outcome.message === 'string'
  )
    return {
      valid: true,
      value: { kind, requestId, outcome: { status: outcome.status, message: outcome.message } },
    }
  if (outcome.status !== 'completed') return invalid
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
