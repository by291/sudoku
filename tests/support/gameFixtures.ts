import type { GameSession } from '@/features/game/model/session'
import { PUZZLE_VERSION } from '@/core/sudoku/generation/types'
import type { Puzzle } from '@/core/sudoku/puzzle'
import { assessPuzzle, toAssessmentOutcome } from '@/core/sudoku/rating/assessment'
import { createAssessmentInput } from '@/core/sudoku/rating/input'
import { toPuzzleAssessment } from '@/core/sudoku/rating/decoding'
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
      rules: { kind: 'classic' },
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

// Snapshot tests consume a real assessment; algorithm expectations live in the core fixture suite.
export function makeAssessment(puzzle: Puzzle = makeSession().puzzle) {
  return toPuzzleAssessment(
    toAssessmentOutcome(assessPuzzle(createAssessmentInput(puzzle.givens, puzzle.rules))),
    { variant: puzzle.rules.kind, difficulty: puzzle.difficulty },
  )
}
