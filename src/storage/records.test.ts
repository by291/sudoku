import { expect, it } from 'vitest'
import {
  parseSessionRecord,
  parseResultRecord,
  parseSettings,
  parseLessonProgress,
} from '@/storage/records'
import { makeSession } from '../../tests/support/gameFixtures'
import { applySessionAction } from '@/features/game/model/session'

const fixture = { formatVersion: 1, revision: 0, session: makeSession() }
it('accepts valid sessions including wrong player entries and older stored puzzle versions', () => {
  expect(parseSessionRecord(fixture)).toEqual({ valid: true, value: fixture })
  const session = applySessionAction(makeSession(), { kind: 'enter', cell: 2, digit: 1 }).session
  expect(
    parseSessionRecord({
      ...fixture,
      session: { ...session, puzzle: { ...session.puzzle, puzzleVersion: 'older-version' } },
    }).valid,
  ).toBe(true)
})
it.each([
  { entries: Array(80).fill(0) },
  { entries: Array(81).fill(0.5) },
  { notes: Array(81).fill(512) },
  { entries: Array(81).fill(1) },
  { elapsedMs: -1 },
  { id: '' },
  { metadata: { kind: 'daily', challengeDate: '2026-02-30', formalAttempt: true }, mode: 'daily' },
  { puzzle: { ...fixture.session.puzzle, solution: Array(81).fill(1) } },
  { completion: { completedAt: '2026-10-11T01:05:00.000Z', elapsedMs: 0 } },
  {
    undoStack: [
      {
        before: { entries: Array(81).fill(0), notes: Array(81).fill(0) },
        after: { entries: Array(81).fill(1), notes: Array(81).fill(0) },
      },
    ],
  },
])('rejects corrupt session fields %j', (change) => {
  expect(parseSessionRecord({ ...fixture, session: { ...fixture.session, ...change } }).valid).toBe(
    false,
  )
})
it('rejects future record formats without regenerating their puzzle', () => {
  expect(parseSessionRecord({ ...fixture, formatVersion: 2 }).valid).toBe(false)
  expect(parseResultRecord(fixture).valid).toBe(false)
})
it('validates undo and redo endpoints rather than accepting arbitrary snapshots', () => {
  let session = applySessionAction(makeSession(), { kind: 'enter', cell: 2, digit: 4 }).session
  session = applySessionAction(session, { kind: 'undo' }).session
  expect(parseSessionRecord({ ...fixture, session }).valid).toBe(true)
  expect(
    parseSessionRecord({
      ...fixture,
      session: { ...session, entries: Array(81).fill(0), notes: Array(81).fill(1) },
    }).valid,
  ).toBe(false)
})
it('validates settings and lesson records independently', () => {
  const settings = {
    theme: 'dark',
    showTimer: false,
    highlightConflicts: true,
    currentLessonId: null,
  }
  expect(parseSettings(settings)).toEqual({ valid: true, value: settings })
  expect(parseSettings({ ...settings, theme: 'unknown' }).valid).toBe(false)
  expect(parseSettings({ ...settings, currentLessonId: 'missing' }).valid).toBe(false)
  expect(parseSettings({ ...settings, currentLessonId: 'hidden-pair' }).valid).toBe(true)
  expect(
    parseLessonProgress({ lessonId: 'rules', completedAt: '2026-10-11T01:05:00.000Z' }).valid,
  ).toBe(true)
  expect(parseLessonProgress({ lessonId: '', completedAt: 'yesterday' }).valid).toBe(false)
})
