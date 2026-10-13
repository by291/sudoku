import { expect, it } from 'vitest'
import {
  parseSessionRecord,
  parseResultRecord,
  parseSettings,
  parseLessonProgress,
} from '@/storage/records'
import { makeAssessment, makeSession } from '../../tests/support/gameFixtures'
import { applySessionAction } from '@/features/game/model/session'
import { VARIANT_FIXTURES } from '../../tests/fixtures/variants'

const fixture = { formatVersion: 2, revision: 0, session: makeSession() }

it.each([null, { status: 'rated', summary: { ratingVersion: 'future' } }])(
  'keeps a valid game when its assessment is corrupt or unsupported: %j',
  (assessment) => {
    const played = applySessionAction(makeSession(), { kind: 'enter', cell: 2, digit: 4 }).session
    const session = applySessionAction(played, { kind: 'hint-shown' }).session
    const parsed = parseSessionRecord({
      formatVersion: 2,
      revision: 19,
      session: { ...session, assessment },
    })

    expect(parsed).toMatchObject({
      valid: true,
      value: { revision: 19, session: { ...session, assessment: { status: 'unavailable' } } },
    })
    if (parsed.valid) {
      expect(parseSessionRecord(parsed.value)).toEqual(parsed)
    }
  },
)

it('preserves the completed assessment snapshot and leaves old records absent', () => {
  const session = makeSession({ assessment: makeAssessment() })
  session.entries = session.puzzle.solution.map((digit, cell) =>
    session.puzzle.givens[cell] ? 0 : digit,
  )
  session.completion = { completedAt: session.startedAt, elapsedMs: 0 }

  expect(parseResultRecord({ formatVersion: 2, session })).toEqual({
    valid: true,
    value: { formatVersion: 2, session },
  })
  expect(parseSessionRecord(fixture)).toEqual({ valid: true, value: fixture })
})
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
  expect(parseSessionRecord({ ...fixture, formatVersion: 3 }).valid).toBe(false)
  expect(parseResultRecord(fixture).valid).toBe(false)
})

it('normalizes legacy history, revisions, assistance, and original puzzle metadata', () => {
  let session = applySessionAction(makeSession(), { kind: 'enter', cell: 2, digit: 4 }).session
  session = applySessionAction(session, { kind: 'enter', cell: 3, digit: 6 }).session
  session = applySessionAction(session, { kind: 'undo' }).session
  session = applySessionAction(session, { kind: 'hint-shown' }).session
  const { rules, ...legacyPuzzle } = session.puzzle

  expect(rules.kind).toBe('classic')
  const raw = { formatVersion: 1, revision: 17, session: { ...session, puzzle: legacyPuzzle } }

  expect(parseSessionRecord(raw)).toEqual({
    valid: true,
    value: { formatVersion: 2, revision: 17, session },
  })
  expect(parseSessionRecord({ ...raw, formatVersion: 2 }).valid).toBe(false)
})

it('preserves a legacy formal result without granting another identity', () => {
  const session = makeSession({
    id: 'daily:2026-10-11:formal',
    mode: 'daily',
    metadata: { kind: 'daily', challengeDate: '2026-10-11', formalAttempt: true },
  })
  session.entries = session.puzzle.solution.map((digit, cell) =>
    session.puzzle.givens[cell] === 0 ? digit : 0,
  )
  session.completion = { completedAt: session.startedAt, elapsedMs: 0 }
  const { rules, ...legacyPuzzle } = session.puzzle

  expect(rules.kind).toBe('classic')
  expect(
    parseResultRecord({ formatVersion: 1, session: { ...session, puzzle: legacyPuzzle } }),
  ).toEqual({ valid: true, value: { formatVersion: 2, session } })
})

it('accepts complete variant records and rejects mismatched formal identities or malformed rules', () => {
  const session = makeSession({
    id: 'daily:arrow:2026-10-11:formal',
    mode: 'daily',
    metadata: { kind: 'daily', challengeDate: '2026-10-11', formalAttempt: true },
    puzzle: { ...makeSession().puzzle, ...VARIANT_FIXTURES.arrow },
  })

  expect(parseSessionRecord({ formatVersion: 2, revision: 1, session }).valid).toBe(true)
  expect(
    parseSessionRecord({
      formatVersion: 2,
      revision: 1,
      session: { ...session, id: 'daily:2026-10-11:formal' },
    }).valid,
  ).toBe(false)

  for (const rules of [
    { kind: 'unknown' },
    { kind: 'arrow', arrows: [{ circle: 0, shaft: [2] }] },
  ]) {
    expect(
      parseSessionRecord({
        formatVersion: 2,
        revision: 1,
        session: { ...session, puzzle: { ...session.puzzle, rules } },
      }).valid,
    ).toBe(false)
  }
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
