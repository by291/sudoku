import type {
  Assistance,
  BoardLayers,
  GameSession,
  HistoryMove,
  SessionMetadata,
} from '@/features/game/model/session'
import type { ParseResult } from '@/core/sudoku/types'
import type { Board } from '@/core/sudoku/types'
import { isRecord, ALL_DIGITS_MASK, BOARD_SIZE } from '@/core/sudoku/types'
import { parsePuzzle } from '@/core/sudoku/generation'
import type { Puzzle } from '@/core/sudoku/generation'
import { CLASSIC_RULES, compileRules } from '@/core/sudoku/rules'
import { getDailyIdentity } from '@/features/game/model/daily'
import { parseBoard, isComplete } from '@/core/sudoku/board'
import type { Settings } from '@/features/settings/model/preferences'
import { isLessonId } from '@/features/learning/model/lessonIds'
import { decodePuzzleAssessment } from '@/core/sudoku/rating'

export type SessionRecord = { formatVersion: 2; revision: number; session: GameSession }

export type ResultRecord = { formatVersion: 2; session: GameSession }

export type LessonProgress = { lessonId: string; completedAt: string }

export type StorageFailure = {
  kind: 'unavailable' | 'write-failed' | 'ownership-lost' | 'revision-conflict'
  message: string
}

export type StorageOutcome<T> = { ok: true; value: T } | { ok: false; error: StorageFailure }

export function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 200
}

export function isIsoInstant(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  )
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const timestamp = `${value}T00:00:00.000Z`

  return isIsoInstant(timestamp)
}

function parseMetadata(value: unknown): SessionMetadata | null {
  if (!isRecord(value)) {
    return null
  }

  if (value.kind === 'free') {
    return { kind: 'free' }
  }

  if (value.kind === 'learning' && isIdentifier(value.lessonId)) {
    return { kind: 'learning', lessonId: value.lessonId }
  }

  if (
    value.kind === 'daily' &&
    validDate(value.challengeDate) &&
    typeof value.formalAttempt === 'boolean'
  ) {
    return { kind: 'daily', challengeDate: value.challengeDate, formalAttempt: value.formalAttempt }
  }

  return null
}

function parseLayers(value: unknown, givens: Board): BoardLayers | null {
  if (!isRecord(value)) {
    return null
  }

  const entries = parseBoard(value.entries)
  if (
    !entries.valid ||
    !Array.isArray(value.notes) ||
    value.notes.length !== BOARD_SIZE ||
    !value.notes.every((mask: unknown) => isNonnegativeInteger(mask) && mask <= ALL_DIGITS_MASK)
  ) {
    return null
  }

  const notes: number[] = []

  for (const raw of value.notes) {
    if (!isNonnegativeInteger(raw)) {
      return null
    }

    notes.push(raw)
  }

  if (entries.value.some((digit, cell) => givens[cell] !== 0 && digit !== 0)) {
    return null
  }

  if (notes.some((mask, cell) => mask !== 0 && (givens[cell] !== 0 || entries.value[cell] !== 0))) {
    return null
  }

  return { entries: entries.value, notes }
}

function sameLayers(first: BoardLayers, second: BoardLayers): boolean {
  return (
    first.entries.every((value, cell) => value === second.entries[cell]) &&
    first.notes.every((value, cell) => value === second.notes[cell])
  )
}

function parseHistory(value: unknown, givens: Board): HistoryMove[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const history: HistoryMove[] = []

  for (const move of value) {
    if (!isRecord(move)) {
      return null
    }

    const before = parseLayers(move.before, givens)
    const after = parseLayers(move.after, givens)
    if (!before || !after || sameLayers(before, after)) {
      return null
    }

    history.push({ before, after })
  }

  return history
}

function parseAssistance(value: unknown): Assistance | null {
  if (
    !isRecord(value) ||
    !isNonnegativeInteger(value.hintCount) ||
    !isNonnegativeInteger(value.checkCount) ||
    !isNonnegativeInteger(value.candidateCount) ||
    typeof value.assisted !== 'boolean'
  ) {
    return null
  }

  if (!value.assisted && value.hintCount + value.checkCount + value.candidateCount > 0) {
    return null
  }

  return {
    hintCount: value.hintCount,
    checkCount: value.checkCount,
    candidateCount: value.candidateCount,
    assisted: value.assisted,
  }
}

export function parseSession(value: unknown): ParseResult<GameSession> {
  const invalid = (message: string): ParseResult<GameSession> => ({
    valid: false,
    issues: [message],
  })
  if (
    !isRecord(value) ||
    !isIdentifier(value.id) ||
    !isIsoInstant(value.startedAt) ||
    !isNonnegativeInteger(value.elapsedMs)
  ) {
    return invalid('Invalid session identity or duration')
  }

  const puzzle = parsePuzzle(value.puzzle)
  const metadata = parseMetadata(value.metadata)
  const assistance = parseAssistance(value.assistance)
  if (!puzzle.valid || !metadata || metadata.kind !== value.mode || !assistance) {
    return invalid('Invalid puzzle, mode metadata, or assistance')
  }

  if (
    metadata.kind === 'daily' &&
    metadata.formalAttempt !==
      (value.id === getDailyIdentity(metadata.challengeDate, puzzle.value.rules.kind).formalId)
  ) {
    return invalid('Daily formal identity does not match eligibility')
  }

  const layers = parseLayers(value, puzzle.value.givens)
  const undoStack = parseHistory(value.undoStack, puzzle.value.givens)
  const redoStack = parseHistory(value.redoStack, puzzle.value.givens)
  if (!layers || !undoStack || !redoStack) {
    return invalid('Invalid board layers or history')
  }

  // Valid moves alone are insufficient: both stacks must form a chain anchored to current layers.
  for (let index = 1; index < undoStack.length; index++) {
    if (!sameLayers(undoStack[index - 1].after, undoStack[index].before)) {
      return invalid('Disconnected undo history')
    }
  }

  for (let index = 1; index < redoStack.length; index++) {
    if (!sameLayers(redoStack[index - 1].before, redoStack[index].after)) {
      return invalid('Disconnected redo history')
    }
  }

  const undo = undoStack.at(-1)
  const redo = redoStack.at(-1)
  if ((undo && !sameLayers(undo.after, layers)) || (redo && !sameLayers(redo.before, layers))) {
    return invalid('History does not match current board')
  }

  let completion: GameSession['completion'] = null
  if (value.completion !== null) {
    if (
      !isRecord(value.completion) ||
      !isIsoInstant(value.completion.completedAt) ||
      !isNonnegativeInteger(value.completion.elapsedMs) ||
      value.completion.elapsedMs !== value.elapsedMs
    ) {
      return invalid('Invalid completion metadata')
    }

    const board = puzzle.value.givens.map((given, cell) =>
      given === 0 ? layers.entries[cell] : given,
    )
    if (!isComplete(board, compileRules(puzzle.value.rules))) {
      return invalid('Completed session is not solved')
    }

    completion = {
      completedAt: value.completion.completedAt,
      elapsedMs: value.completion.elapsedMs,
    }
  }

  // Optional assessment corruption must not quarantine an independently valid game.
  const assessment = decodePuzzleAssessment(value.assessment, {
    variant: puzzle.value.rules.kind,
    difficulty: puzzle.value.difficulty,
  })

  return {
    valid: true,
    value: {
      id: value.id,
      puzzle: puzzle.value,
      ...(assessment === undefined ? {} : { assessment }),
      mode: metadata.kind,
      metadata,
      ...layers,
      undoStack,
      redoStack,
      elapsedMs: value.elapsedMs,
      assistance,
      startedAt: value.startedAt,
      completion,
    },
  }
}

function parseLegacyPuzzle(value: unknown): ParseResult<Puzzle> {
  if (!isRecord(value)) {
    return { valid: false, issues: ['Invalid legacy puzzle'] }
  }

  const parsed = parsePuzzle({ ...value, rules: value.rules ?? CLASSIC_RULES })
  if (parsed.valid && parsed.value.rules.kind !== 'classic') {
    return { valid: false, issues: ['Legacy records only support Classic Sudoku'] }
  }

  return parsed
}

function parseLegacySession(value: unknown): ParseResult<GameSession> {
  if (!isRecord(value)) {
    return { valid: false, issues: ['Invalid legacy session'] }
  }

  const puzzle = parseLegacyPuzzle(value.puzzle)

  return puzzle.valid ? parseSession({ ...value, puzzle: puzzle.value }) : puzzle
}

export function parseSessionRecord(value: unknown): ParseResult<SessionRecord> {
  if (
    !isRecord(value) ||
    (value.formatVersion !== 1 && value.formatVersion !== 2) ||
    !isNonnegativeInteger(value.revision)
  ) {
    return { valid: false, issues: ['Unsupported session format or revision'] }
  }

  const session =
    value.formatVersion === 1 ? parseLegacySession(value.session) : parseSession(value.session)

  return session.valid
    ? { valid: true, value: { formatVersion: 2, revision: value.revision, session: session.value } }
    : session
}

export function parseResultRecord(value: unknown): ParseResult<ResultRecord> {
  if (!isRecord(value) || (value.formatVersion !== 1 && value.formatVersion !== 2)) {
    return { valid: false, issues: ['Unsupported result format'] }
  }

  const session =
    value.formatVersion === 1 ? parseLegacySession(value.session) : parseSession(value.session)
  if (!session.valid) {
    return session
  }

  return session.value.completion
    ? { valid: true, value: { formatVersion: 2, session: session.value } }
    : { valid: false, issues: ['Result must be completed'] }
}

export function parseSettings(value: unknown): ParseResult<Settings> {
  if (
    !isRecord(value) ||
    (value.formatVersion !== undefined && value.formatVersion !== 1) ||
    (value.theme !== 'light' && value.theme !== 'dark' && value.theme !== 'system') ||
    typeof value.showTimer !== 'boolean' ||
    typeof value.highlightConflicts !== 'boolean' ||
    (value.currentLessonId !== undefined &&
      value.currentLessonId !== null &&
      !isLessonId(value.currentLessonId))
  ) {
    return { valid: false, issues: ['Invalid settings'] }
  }

  return {
    valid: true,
    value: {
      theme: value.theme,
      showTimer: value.showTimer,
      highlightConflicts: value.highlightConflicts,
      currentLessonId: isLessonId(value.currentLessonId) ? value.currentLessonId : null,
    },
  }
}

export function parseLessonProgress(value: unknown): ParseResult<LessonProgress> {
  if (
    !isRecord(value) ||
    (value.formatVersion !== undefined && value.formatVersion !== 1) ||
    !isIdentifier(value.lessonId) ||
    !isIsoInstant(value.completedAt)
  ) {
    return { valid: false, issues: ['Invalid lesson progress'] }
  }

  return { valid: true, value: { lessonId: value.lessonId, completedAt: value.completedAt } }
}
