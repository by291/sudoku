import { createTestEngine } from './wasm'
import { createGameRepository as createRepository } from '@/storage/repository'
import {
  parseSessionRecord as decodeSession,
  parseResultRecord as decodeResult,
} from '@/storage/records'
import { parseBackup as decodeBackup } from '@/storage/backup'
import {
  applySessionAction as applyFacts,
  commitBoardEdit,
  completeSession as complete,
  createSession as create,
} from '@/features/game/model/session'
import type { GameSession, GameAction } from '@/features/game/model/session'
import { sessionBoard } from '@/features/game/model/session'
import { validatePuzzleSnapshot } from '@/sudoku/puzzleSnapshot'

// One fixture-owned memory per test worker. Production always receives an explicit ready engine.
export const testEngine = await createTestEngine()
process.once('exit', () => testEngine.dispose())

export function createGameRepository(
  database: Parameters<typeof createRepository>[0],
  options?: Parameters<typeof createRepository>[2],
) {
  return createRepository(database, testEngine, options)
}
export const parseSessionRecord = (value: unknown) => decodeSession(value, testEngine)
export const parseResultRecord = (value: unknown) => decodeResult(value, testEngine)
export const parseBackup = (text: string) => decodeBackup(text, testEngine)

export function createSession(...args: Parameters<typeof create>) {
  const [puzzle, metadata, id, startedAt, assessment] = args
  const checked = validatePuzzleSnapshot(puzzle, testEngine)
  if (checked.status !== 'valid') {
    throw new TypeError('Invalid fixture puzzle')
  }
  const decoded = testEngine.validateAssessment({
    present: assessment !== undefined,
    value: assessment ?? null,
    identity: { variant: puzzle.rules.kind, difficulty: puzzle.difficulty },
  })
  return create(
    checked.value,
    metadata,
    id,
    startedAt,
    decoded.status === 'present' ? decoded.value : undefined,
  )
}

export function applySessionAction(session: GameSession, action: GameAction, maxWork?: number) {
  const prepared = testEngine.prepare(session.puzzle.rules)
  try {
    const result =
      action.kind === 'enter' ||
      action.kind === 'erase' ||
      action.kind === 'toggle-note' ||
      action.kind === 'generate-notes'
        ? commitBoardEdit(
            session,
            prepared.edit({
              givens: [...session.puzzle.givens],
              entries: [...session.entries],
              notes: [...session.notes],
              action,
              ...(maxWork === undefined ? {} : { work: { maxWork } }),
            }).result,
            action,
          )
        : applyFacts(session, action)
    return {
      ...result,
      boardComplete:
        result.status === 'complete' &&
        result.changed &&
        prepared.isComplete(sessionBoard(result.session)),
    }
  } finally {
    prepared.dispose()
  }
}

export function completeSession(session: GameSession, completedAt: string, elapsedMs: number) {
  const prepared = testEngine.prepare(session.puzzle.rules)
  try {
    return complete(session, completedAt, elapsedMs, prepared.isComplete(sessionBoard(session)))
  } finally {
    prepared.dispose()
  }
}
