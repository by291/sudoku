import type {
  Assistance,
  BoardLayers,
  GameSession,
  HistoryMove,
  SessionMetadata,
} from '@/features/game/model/session'
import type { ParseResult } from '@/sudoku/contracts'
import type { Board } from '@/sudoku/contracts'
import { isRecord, ALL_DIGITS_MASK, BOARD_SIZE } from '@/sudoku/values'
import { validatePuzzleSnapshot } from '@/sudoku/puzzleSnapshot'
import type { MainSudokuEngine } from '@/sudoku/mainEngine'
import type { Puzzle } from '@/sudoku/contracts'
import { CLASSIC_RULES } from '@/sudoku/catalogue'
import { getDailyFormalId } from '@/features/game/model/daily'
import { isBoard } from '@/sudoku/values'
import type { Settings } from '@/features/settings/model/preferences'
import { isLessonId, lessonStageCount } from '@/features/learning/model/lessonIds'

/** Ready, synchronous validators only: decoding must never await inside an IDB transaction. */
export type SnapshotValidators = Pick<MainSudokuEngine, 'validatePuzzle' | 'validateAssessment'>

/** Inconclusive computation is a service failure, never evidence of corrupt player data. */
export class SnapshotValidationUnavailable extends Error {}

function validateSnapshot<T>(operation: () => T): T {
  try {
    return operation()
  } catch (error) {
    throw new SnapshotValidationUnavailable(
      error instanceof Error ? error.message : 'Semantic validator unavailable',
    )
  }
}

function parsePuzzle(value: unknown, validators: SnapshotValidators): ParseResult<Puzzle> {
  const result = validateSnapshot(() => validatePuzzleSnapshot(value, validators))
  if (result.status === 'budget-exhausted') {
    throw new SnapshotValidationUnavailable('Puzzle validation exhausted its work budget')
  }
  return result.status === 'valid'
    ? { valid: true, value: result.value }
    : { valid: false, issues: [...result.issues] }
}

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

export function parseSessionMetadata(value: unknown): SessionMetadata | null {
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

  const entries = value.entries
  if (
    !isBoard(entries) ||
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

  if (entries.some((digit, cell) => givens[cell] !== 0 && digit !== 0)) {
    return null
  }

  if (notes.some((mask, cell) => mask !== 0 && (givens[cell] !== 0 || entries[cell] !== 0))) {
    return null
  }

  return { entries: [...entries], notes }
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

export function parseSession(
  value: unknown,
  validators: SnapshotValidators,
): ParseResult<GameSession> {
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

  const puzzle = parsePuzzle(value.puzzle, validators)
  const metadata = parseSessionMetadata(value.metadata)
  const assistance = parseAssistance(value.assistance)
  if (!puzzle.valid || !metadata || metadata.kind !== value.mode || !assistance) {
    return invalid('Invalid puzzle, mode metadata, or assistance')
  }

  if (
    metadata.kind === 'daily' &&
    metadata.formalAttempt !==
      (value.id === getDailyFormalId(metadata.challengeDate, puzzle.value.rules.kind))
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
    const solved = validateSnapshot(() =>
      validators.validatePuzzle({
        givens: [...puzzle.value.givens],
        solution: board,
        rules: puzzle.value.rules,
        difficulty: puzzle.value.difficulty,
      }),
    )
    if (solved.status === 'budget-exhausted') {
      throw new SnapshotValidationUnavailable('Completion validation exhausted its work budget')
    }
    if (solved.status !== 'valid') {
      return invalid('Completed session is not solved')
    }

    completion = {
      completedAt: value.completion.completedAt,
      elapsedMs: value.completion.elapsedMs,
    }
  }

  // Optional assessment corruption must not quarantine an independently valid game.
  const decoded = validateSnapshot(() =>
    validators.validateAssessment({
      present: value.assessment !== undefined,
      value: value.assessment ?? null,
      identity: { variant: puzzle.value.rules.kind, difficulty: puzzle.value.difficulty },
    }),
  )
  const assessment = decoded.status === 'absent' ? undefined : decoded.value

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

function parseLegacyPuzzle(value: unknown, validators: SnapshotValidators): ParseResult<Puzzle> {
  if (!isRecord(value)) {
    return { valid: false, issues: ['Invalid legacy puzzle'] }
  }

  const parsed = parsePuzzle({ ...value, rules: value.rules ?? CLASSIC_RULES }, validators)
  if (parsed.valid && parsed.value.rules.kind !== 'classic') {
    return { valid: false, issues: ['Legacy records only support Classic Sudoku'] }
  }

  return parsed
}

function parseLegacySession(
  value: unknown,
  validators: SnapshotValidators,
): ParseResult<GameSession> {
  if (!isRecord(value)) {
    return { valid: false, issues: ['Invalid legacy session'] }
  }

  const puzzle = parseLegacyPuzzle(value.puzzle, validators)

  return puzzle.valid ? parseSession({ ...value, puzzle: puzzle.value }, validators) : puzzle
}

export function parseSessionRecord(
  value: unknown,
  validators: SnapshotValidators,
): ParseResult<SessionRecord> {
  if (
    !isRecord(value) ||
    (value.formatVersion !== 1 && value.formatVersion !== 2) ||
    !isNonnegativeInteger(value.revision)
  ) {
    return { valid: false, issues: ['Unsupported session format or revision'] }
  }

  const session =
    value.formatVersion === 1
      ? parseLegacySession(value.session, validators)
      : parseSession(value.session, validators)

  return session.valid
    ? { valid: true, value: { formatVersion: 2, revision: value.revision, session: session.value } }
    : session
}

export function parseResultRecord(
  value: unknown,
  validators: SnapshotValidators,
): ParseResult<ResultRecord> {
  if (!isRecord(value) || (value.formatVersion !== 1 && value.formatVersion !== 2)) {
    return { valid: false, issues: ['Unsupported result format'] }
  }

  const session =
    value.formatVersion === 1
      ? parseLegacySession(value.session, validators)
      : parseSession(value.session, validators)
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

  let lessonStages: Record<string, number> | undefined
  if (value.lessonStages !== undefined) {
    if (!isRecord(value.lessonStages) || Object.keys(value.lessonStages).length > 32) {
      return { valid: false, issues: ['Invalid lesson stage progress'] }
    }
    lessonStages = {}
    for (const [id, stage] of Object.entries(value.lessonStages)) {
      if (!isLessonId(id) || !isNonnegativeInteger(stage) || stage >= lessonStageCount(id)) {
        return { valid: false, issues: ['Invalid lesson stage progress'] }
      }
      lessonStages[id] = stage
    }
  }

  return {
    valid: true,
    value: {
      theme: value.theme,
      showTimer: value.showTimer,
      highlightConflicts: value.highlightConflicts,
      currentLessonId: isLessonId(value.currentLessonId) ? value.currentLessonId : null,
      ...(lessonStages ? { lessonStages } : {}),
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
