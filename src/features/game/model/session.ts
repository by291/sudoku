import type { Board, Digit, NoteMask } from '@/core/sudoku/types'
import type { Puzzle } from '@/core/sudoku/generation'
import { parsePuzzle } from '@/core/sudoku/generation'
import { calculateCandidates, isCellIndex, isComplete, maskOf, PEERS } from '@/core/sudoku/board'
import { BOARD_SIZE, isDigit } from '@/core/sudoku/types'
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
export function createSession(
  puzzle: Puzzle,
  metadata: SessionMetadata,
  id: string,
  startedAt: string,
): GameSession {
  const parsed = parsePuzzle(puzzle)
  if (!parsed.valid) throw new TypeError(parsed.issues.join('; '))
  if (!id || id.length > 200 || !Number.isFinite(Date.parse(startedAt)))
    throw new TypeError('Invalid session identity')
  return {
    id,
    puzzle: parsed.value,
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
): { session: GameSession; changed: boolean; boardComplete: boolean } {
  const unchanged = { session, changed: false, boardComplete: false }
  if (session.completion) return unchanged
  if ('cell' in action && (!isCellIndex(action.cell) || session.puzzle.givens[action.cell] !== 0))
    return unchanged
  if ('digit' in action && !isDigit(action.digit)) return unchanged
  if (action.kind === 'undo' || action.kind === 'redo') {
    const source = action.kind === 'undo' ? session.undoStack : session.redoStack
    const move = source.at(-1)
    if (!move) return unchanged
    const restored = layers(action.kind === 'undo' ? move.before : move.after)
    const next = {
      ...session,
      ...restored,
      undoStack:
        action.kind === 'undo' ? session.undoStack.slice(0, -1) : [...session.undoStack, move],
      redoStack:
        action.kind === 'redo' ? session.redoStack.slice(0, -1) : [...session.redoStack, move],
    }
    return { session: next, changed: true, boardComplete: isComplete(sessionBoard(next)) }
  }
  const before = layers(session),
    entries = [...session.entries],
    notes = [...session.notes]
  const assistance = { ...session.assistance }
  switch (action.kind) {
    case 'enter':
      if (entries[action.cell] === action.digit) return unchanged
      entries[action.cell] = action.digit
      notes[action.cell] = 0
      for (const peer of PEERS[action.cell]) notes[peer] &= ~maskOf(action.digit)
      break
    case 'erase':
      entries[action.cell] = 0
      notes[action.cell] = 0
      break
    case 'toggle-note':
      if (entries[action.cell] !== 0) return unchanged
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
    case 'generate-notes':
      notes.splice(0, BOARD_SIZE, ...calculateCandidates(sessionBoard(session)))
      assistance.candidateCount++
      assistance.assisted = true
      break
  }
  const after = { entries, notes }
  const boardChanged = !sameLayers(before, after)
  const assistedChanged =
    assistance.hintCount !== session.assistance.hintCount ||
    assistance.checkCount !== session.assistance.checkCount ||
    assistance.candidateCount !== session.assistance.candidateCount
  if (!boardChanged && !assistedChanged) return unchanged
  const next: GameSession = {
    ...session,
    ...after,
    assistance,
    undoStack: boardChanged
      ? [...session.undoStack, { before, after: layers(after) }]
      : session.undoStack,
    redoStack: boardChanged ? [] : session.redoStack,
  }
  return { session: next, changed: true, boardComplete: isComplete(sessionBoard(next)) }
}
export function completeSession(
  session: GameSession,
  completedAt: string,
  elapsedMs: number,
): GameSession {
  if (session.completion || !isComplete(sessionBoard(session))) return session
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || !Number.isFinite(Date.parse(completedAt)))
    throw new TypeError('Invalid completion metadata')
  const duration = Math.floor(elapsedMs)
  return { ...session, elapsedMs: duration, completion: { completedAt, elapsedMs: duration } }
}
