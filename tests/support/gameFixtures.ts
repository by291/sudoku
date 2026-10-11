import type { GameSession } from '../../src/features/game/session'
import { PUZZLE_VERSION } from '../../src/core/sudoku/generation'
import { uniqueBoard, solvedBoard } from '../fixtures/sudoku'

export function makeSession(overrides: Partial<GameSession> = {}): GameSession {
  return {
    id: 'fixture-free-session',
    mode: 'free',
    puzzle: {
      givens: uniqueBoard,
      solution: solvedBoard,
      difficulty: 'easy',
      seed: 'fixture',
      puzzleVersion: PUZZLE_VERSION,
    },
    entries: Array(81).fill(0),
    notes: Array(81).fill(0),
    undoStack: [],
    redoStack: [],
    elapsedMs: 0,
    assistance: { hintCount: 0, checkCount: 0, candidateCount: 0, assisted: false },
    startedAt: '2026-10-11T01:00:00.000Z',
    completion: null,
    metadata: { kind: 'free' },
    ...overrides,
  }
}
