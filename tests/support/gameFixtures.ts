import type { GameSession } from '@/features/game/model/session'
import type { Puzzle } from '@/sudoku/contracts'
import { assessPuzzle, toAssessmentOutcome } from './engine'
import { createAssessmentInput } from './assessment'
import { testEngine } from './semantics'
import { uniqueBoard, solvedBoard } from '../fixtures/sudoku'

// Authored persisted fixtures predate byte seeds; retain their historical text identities.
export const HISTORICAL_CLASSIC_VERSION = 'sudoku-v10'
export const HISTORICAL_VARIANT_VERSION = 'sudoku-variants-v10'

export function makeSession(overrides: Partial<GameSession> = {}): GameSession {
  return {
    id: 'fixture-free-session',
    mode: 'free',
    puzzle: {
      givens: uniqueBoard,
      solution: solvedBoard,
      difficulty: 'easy',
      seed: 'fixture',
      puzzleVersion: HISTORICAL_CLASSIC_VERSION,
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
  const assessment = toAssessmentOutcome(
    assessPuzzle(createAssessmentInput(puzzle.givens, puzzle.rules)),
  )
  const decoded = testEngine.validateAssessment({
    present: true,
    value: assessment,
    identity: { variant: puzzle.rules.kind, difficulty: puzzle.difficulty },
  })
  if (decoded.status !== 'present') {
    throw new Error('Expected assessment fixture')
  }

  return decoded.value
}
