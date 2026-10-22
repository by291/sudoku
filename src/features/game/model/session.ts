import type { Board, Digit, NoteMask } from '@/sudoku/contracts'
import type { Puzzle } from '@/sudoku/contracts'
import type { PuzzleAssessment } from '@/sudoku/contracts'
import type { EditComputationDto } from '@/sudoku/contracts'
import { copyRules } from '@/sudoku/ruleInput'

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
  | { status: 'complete'; session: GameSession; changed: boolean }
  | { status: 'incomplete'; session: GameSession; changed: false }

export type BoardEditAction = Extract<
  GameAction,
  { kind: 'enter' | 'erase' | 'toggle-note' | 'generate-notes' }
>
export type SessionFactAction = Exclude<GameAction, BoardEditAction>

/** Takes a semantically validated puzzle and normalized assessment; owns the returned snapshots. */
export function createSession(
  puzzle: Puzzle,
  metadata: SessionMetadata,
  id: string,
  startedAt: string,
  assessment?: PuzzleAssessment,
): GameSession {
  if (!id || id.length > 200 || !Number.isFinite(Date.parse(startedAt))) {
    throw new TypeError('Invalid session identity')
  }

  return {
    id,
    puzzle: {
      ...puzzle,
      givens: [...puzzle.givens],
      solution: [...puzzle.solution],
      rules: copyRules(puzzle.rules),
    },
    ...(assessment === undefined ? {} : { assessment: structuredClone(assessment) }),
    mode: metadata.kind,
    metadata: { ...metadata },
    entries: Array(81).fill(0),
    notes: Array(81).fill(0),
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

function unchanged(session: GameSession): SessionActionResult {
  return { status: 'complete', session, changed: false }
}

/** Commits owned Rust edit results. Assistance is permanent; history contains board layers only. */
export function commitBoardEdit(
  session: GameSession,
  outcome: EditComputationDto['result'],
  action: BoardEditAction,
): SessionActionResult {
  if (session.completion) {
    return unchanged(session)
  }
  if (outcome.status === 'incomplete') {
    return { status: 'incomplete', session, changed: false }
  }

  const before = layers(session)
  const after = layers(outcome)
  const boardChanged = !sameLayers(before, after)
  const generatedNotes = action.kind === 'generate-notes'
  if (!boardChanged && !generatedNotes) {
    return unchanged(session)
  }

  return {
    status: 'complete',
    changed: true,
    session: {
      ...session,
      ...after,
      assistance: generatedNotes
        ? {
            ...session.assistance,
            candidateCount: session.assistance.candidateCount + 1,
            assisted: true,
          }
        : session.assistance,
      // Independent snapshots keep subsequent edits from changing a recorded move.
      undoStack: boardChanged
        ? [...session.undoStack, { before, after: layers(after) }]
        : session.undoStack,
      redoStack: boardChanged ? [] : session.redoStack,
    },
  }
}

/** Updates attempt facts and history only. The workflow asks Rust whether the resulting board is complete. */
export function applySessionAction(
  session: GameSession,
  action: SessionFactAction,
): SessionActionResult {
  if (session.completion) {
    return unchanged(session)
  }
  if (action.kind === 'undo' || action.kind === 'redo') {
    const source = action.kind === 'undo' ? session.undoStack : session.redoStack
    const move = source.at(-1)
    if (!move) {
      return unchanged(session)
    }
    return {
      status: 'complete',
      changed: true,
      session: {
        ...session,
        ...layers(action.kind === 'undo' ? move.before : move.after),
        undoStack:
          action.kind === 'undo' ? session.undoStack.slice(0, -1) : [...session.undoStack, move],
        redoStack:
          action.kind === 'redo' ? session.redoStack.slice(0, -1) : [...session.redoStack, move],
      },
    }
  }

  const assistance = { ...session.assistance, assisted: true }
  if (action.kind === 'hint-shown') {
    assistance.hintCount++
  } else {
    assistance.checkCount++
  }
  return { status: 'complete', changed: true, session: { ...session, assistance } }
}

export function completeSession(
  session: GameSession,
  completedAt: string,
  elapsedMs: number,
  boardComplete: boolean,
): GameSession {
  if (session.completion || !boardComplete) {
    return session
  }

  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || !Number.isFinite(Date.parse(completedAt))) {
    throw new TypeError('Invalid completion metadata')
  }

  const duration = Math.floor(elapsedMs)

  return { ...session, elapsedMs: duration, completion: { completedAt, elapsedMs: duration } }
}
