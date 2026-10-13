import type { Board, Digit, NoteMask } from '@/core/sudoku/types'
import type { Puzzle } from '@/core/sudoku/generation'
import { parsePuzzle } from '@/core/sudoku/generation'
import { isCellIndex, isComplete, maskOf } from '@/core/sudoku/board'
import { compileRules } from '@/core/sudoku/rules'
import { evaluateCandidates } from '@/core/sudoku/constraints'
import { createWorkBudget, DEFAULT_WORK_LIMIT } from '@/core/sudoku/budget'
import type { WorkBudget } from '@/core/sudoku/budget'
import { BOARD_SIZE, isDigit } from '@/core/sudoku/types'
import { decodePuzzleAssessment } from '@/core/sudoku/rating'
import type { PuzzleAssessment } from '@/core/sudoku/rating'

export type GameMode = 'free' | 'learning' | 'daily'

export type SessionPhase = 'generating' | 'playing' | 'paused' | 'completed' | 'failed'

export type SessionMetadata =
  | { kind: 'free' }
  | { kind: 'learning'; lessonId: string }
  | { kind: 'daily'; challengeDate: string; formalAttempt: boolean }

export type BoardLayers = { entries: Board; notes: readonly NoteMask[] }

export type HistoryMove = { before: BoardLayers; after: BoardLayers }

export type Assistance = {
  hintCount: number
  checkCount: number
  candidateCount: number
  assisted: boolean
}

export type GameSession = {
  id: string
  puzzle: Puzzle
  assessment?: PuzzleAssessment
  mode: GameMode
  entries: Board
  notes: readonly NoteMask[]
  undoStack: readonly HistoryMove[]
  redoStack: readonly HistoryMove[]
  elapsedMs: number
  assistance: Assistance
  startedAt: string
  completion: { completedAt: string; elapsedMs: number } | null
  metadata: SessionMetadata
}

export type GameAction =
  | { kind: 'enter'; cell: number; digit: Digit }
  | { kind: 'erase'; cell: number }
  | { kind: 'toggle-note'; cell: number; digit: Digit }
  | { kind: 'generate-notes' }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'hint-shown' }
  | { kind: 'check' }

export type SessionActionResult =
  | { status: 'complete'; session: GameSession; changed: boolean; boardComplete: boolean }
  | { status: 'budget-exhausted'; session: GameSession; changed: false; boardComplete: false }

export function createSession(
  puzzle: Puzzle,
  metadata: SessionMetadata,
  id: string,
  startedAt: string,
  assessment?: PuzzleAssessment,
): GameSession {
  const parsed = parsePuzzle(puzzle)
  if (!parsed.valid) {
    throw new TypeError(parsed.issues.join('; '))
  }

  if (!id || id.length > 200 || !Number.isFinite(Date.parse(startedAt))) {
    throw new TypeError('Invalid session identity')
  }

  const snapshot = decodePuzzleAssessment(assessment, {
    variant: parsed.value.rules.kind,
    difficulty: parsed.value.difficulty,
  })

  return {
    id,
    puzzle: parsed.value,
    ...(snapshot === undefined ? {} : { assessment: snapshot }),
    mode: metadata.kind,
    metadata: { ...metadata },
    entries: Array(BOARD_SIZE).fill(0),
    notes: Array(BOARD_SIZE).fill(0),
    undoStack: [],
    redoStack: [],
    elapsedMs: 0,
    assistance: { hintCount: 0, checkCount: 0, candidateCount: 0, assisted: false },
    startedAt,
    completion: null,
  }
}

export function sessionBoard(session: GameSession): Board {
  return session.puzzle.givens.map((given, cell) => (given === 0 ? session.entries[cell] : given))
}

function layers(session: BoardLayers): BoardLayers {
  return { entries: [...session.entries], notes: [...session.notes] }
}

function sameLayers(first: BoardLayers, second: BoardLayers): boolean {
  return (
    first.entries.every((value, cell) => value === second.entries[cell]) &&
    first.notes.every((mask, cell) => mask === second.notes[cell])
  )
}

export function applySessionAction(
  session: GameSession,
  action: GameAction,
  workBudget: WorkBudget = createWorkBudget(DEFAULT_WORK_LIMIT),
): SessionActionResult {
  const unchanged: SessionActionResult = {
    status: 'complete',
    session,
    changed: false,
    boardComplete: false,
  }
  if (session.completion) {
    return unchanged
  }

  if ('cell' in action && (!isCellIndex(action.cell) || session.puzzle.givens[action.cell] !== 0)) {
    return unchanged
  }

  if ('digit' in action && !isDigit(action.digit)) {
    return unchanged
  }

  const context = compileRules(session.puzzle.rules)
  if (action.kind === 'undo' || action.kind === 'redo') {
    // History restores board layers only. Assistance is a permanent fact of this attempt.
    const source = action.kind === 'undo' ? session.undoStack : session.redoStack
    const move = source.at(-1)
    if (!move) {
      return unchanged
    }

    const restored = layers(action.kind === 'undo' ? move.before : move.after)
    const next = {
      ...session,
      ...restored,
      undoStack:
        action.kind === 'undo' ? session.undoStack.slice(0, -1) : [...session.undoStack, move],
      redoStack:
        action.kind === 'redo' ? session.redoStack.slice(0, -1) : [...session.redoStack, move],
    }

    return {
      status: 'complete',
      session: next,
      changed: true,
      boardComplete: isComplete(sessionBoard(next), context),
    }
  }

  // Each move keeps independent before/after layers so later edits cannot rewrite history.
  const before = layers(session)
  const entries = [...session.entries]
  const notes = [...session.notes]
  const assistance = { ...session.assistance }
  switch (action.kind) {
    case 'enter':
      if (entries[action.cell] === action.digit) {
        return unchanged
      }
      entries[action.cell] = action.digit
      notes[action.cell] = 0
      for (const peer of context.duplicatePeers[action.cell]) {
        notes[peer] &= ~maskOf(action.digit)
      }
      break
    case 'erase':
      entries[action.cell] = 0
      notes[action.cell] = 0
      break
    case 'toggle-note':
      if (entries[action.cell] !== 0) {
        return unchanged
      }
      notes[action.cell] ^= maskOf(action.digit)
      break
    case 'hint-shown':
      assistance.hintCount++
      assistance.assisted = true
      break
    case 'check':
      assistance.checkCount++
      assistance.assisted = true
      break
    case 'generate-notes': {
      const result = evaluateCandidates(sessionBoard(session), context, workBudget)
      if (result.status === 'budget-exhausted') {
        return { status: 'budget-exhausted', session, changed: false, boardComplete: false }
      }

      notes.splice(0, BOARD_SIZE, ...result.candidates)
      assistance.candidateCount++
      assistance.assisted = true
      break
    }
  }
  const after = { entries, notes }
  const boardChanged = !sameLayers(before, after)
  const assistedChanged =
    assistance.hintCount !== session.assistance.hintCount ||
    assistance.checkCount !== session.assistance.checkCount ||
    assistance.candidateCount !== session.assistance.candidateCount
  if (!boardChanged && !assistedChanged) {
    return unchanged
  }

  const next: GameSession = {
    ...session,
    ...after,
    assistance,
    undoStack: boardChanged
      ? [...session.undoStack, { before, after: layers(after) }]
      : session.undoStack,
    redoStack: boardChanged ? [] : session.redoStack,
  }

  return {
    status: 'complete',
    session: next,
    changed: true,
    boardComplete: isComplete(sessionBoard(next), context),
  }
}

export function completeSession(
  session: GameSession,
  completedAt: string,
  elapsedMs: number,
): GameSession {
  if (
    session.completion ||
    !isComplete(sessionBoard(session), compileRules(session.puzzle.rules))
  ) {
    return session
  }

  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || !Number.isFinite(Date.parse(completedAt))) {
    throw new TypeError('Invalid completion metadata')
  }

  const duration = Math.floor(elapsedMs)

  return { ...session, elapsedMs: duration, completion: { completedAt, elapsedMs: duration } }
}
