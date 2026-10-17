import { expect, it } from 'vitest'
import {
  groupCompletedRecords,
  sortSavedSessions,
  summarizeSave,
  summarizeRecords,
  variantSaves,
} from '@/features/records/model/records'
import type { ResultRecord } from '@/storage/records'
import { makeSession } from '../../../../tests/support/gameFixtures'
import { VARIANT_FIXTURES } from '../../../../tests/fixtures/variants'

function result(
  id: string,
  elapsedMs: number,
  assisted = false,
  date?: string,
  completedAt?: string,
  formalAttempt = true,
): ResultRecord {
  const session = makeSession({
    id,
    elapsedMs,
    completion: { elapsedMs, completedAt: completedAt ?? `${date ?? '2026-10-11'}T01:00:00.000Z` },
    assistance: { assisted, hintCount: assisted ? 1 : 0, checkCount: 0, candidateCount: 0 },
  })
  if (date) {
    session.mode = 'daily'
    session.metadata = { kind: 'daily', challengeDate: date, formalAttempt }
  }

  return { formatVersion: 2, session }
}

it('separates free bests, excludes other modes, and counts each ID once', () => {
  const free = result('free', 60000)
  const learning = result('learn', 1000)
  learning.session.mode = 'learning'
  learning.session.metadata = { kind: 'learning', lessonId: 'rules' }
  const summary = summarizeRecords(
    [
      free,
      free,
      result('fast-assisted', 30000, true),
      learning,
      result('practice', 1000, false, '2026-10-11', undefined, false),
    ],
    '2026-10-11',
  )

  expect(summary.freeBests.easy).toEqual({ assisted: 30000, unassisted: 60000 })
  expect(summary.dailyTotals).toEqual({ assisted: 0, unassisted: 0 })
})
it('joins eligible dates across year boundaries and excludes late finishes from streaks', () => {
  const results = [
    result('d1', 1000, false, '2026-12-30'),
    result('d2', 1000, true, '2026-12-31'),
    result('d3', 1000, false, '2027-01-01'),
    result('late', 1000, false, '2027-01-02', '2027-01-03T01:00:00.000Z'),
  ]

  expect(summarizeRecords(results, '2027-01-02')).toMatchObject({
    currentStreak: 3,
    longestStreak: 3,
    dailyTotals: { assisted: 1, unassisted: 3 },
  })
  expect(summarizeRecords(results, '2027-01-03').currentStreak).toBe(0)
})
it('keeps each type and assistance classification independent on the same dates', () => {
  const classic = result('classic-daily', 1000, false, '2026-10-11')
  const arrowDaily = result('arrow-daily', 2000, true, '2026-10-11')
  const arrowFree = result('arrow-free', 3000)

  for (const record of [arrowDaily, arrowFree]) {
    record.session.puzzle = { ...record.session.puzzle, ...VARIANT_FIXTURES.arrow }
  }

  const all = [classic, arrowDaily, arrowFree]

  expect(summarizeRecords(all, '2026-10-11', 'classic')).toMatchObject({
    dailyTotals: { assisted: 0, unassisted: 1 },
    currentStreak: 1,
    freeBests: { easy: { assisted: null, unassisted: null } },
  })
  expect(summarizeRecords(all, '2026-10-11', 'arrow')).toMatchObject({
    dailyTotals: { assisted: 1, unassisted: 0 },
    currentStreak: 1,
    freeBests: { easy: { assisted: null, unassisted: 3000 } },
  })
})

it('groups history by local completion dates and orders newest completions first', () => {
  const older = result('older', 1000, false, undefined, new Date(2026, 9, 10, 23, 59).toISOString())
  const first = result('first', 2000, false, undefined, new Date(2026, 9, 11, 0, 1).toISOString())
  const latest = result(
    'latest',
    3000,
    false,
    undefined,
    new Date(2026, 9, 11, 16, 0).toISOString(),
  )

  const groups = groupCompletedRecords([older, first, latest])

  expect(
    groups.map((group) => [group.date, group.records.map(({ session }) => session.id)]),
  ).toEqual([
    ['2026-10-11', ['latest', 'first']],
    ['2026-10-10', ['older']],
  ])
})

it('highlights the most recently started unfinished save without discarding completed saves', () => {
  const older = makeSession({ id: 'older', startedAt: '2026-10-10T01:00:00.000Z' })
  const newest = makeSession({ id: 'newest', startedAt: '2026-10-12T01:00:00.000Z' })
  const completed = result('completed', 1000).session
  const otherVariant = makeSession({
    id: 'arrow',
    puzzle: { ...older.puzzle, ...VARIANT_FIXTURES.arrow },
  })
  const saves = [completed, older, otherVariant, newest].map((session) => ({
    formatVersion: 2 as const,
    revision: 1,
    session,
  }))

  const catalog = variantSaves(saves, 'classic')

  expect(catalog.latest?.session.id).toBe('newest')
  expect(catalog.others.map(({ session }) => session.id)).toEqual(['completed', 'older'])
  expect(saves.map(({ session }) => session.id)).toEqual(['completed', 'older', 'arrow', 'newest'])
})

it('counts filled editable cells without treating notes or incorrect entries as correctness', () => {
  const entries = [...makeSession().entries]
  entries[2] = 9
  entries[3] = 6
  const notes = [...makeSession().notes]
  notes[5] = 511
  const session = makeSession({ entries, notes })

  const summary = summarizeSave(session)

  // The fixture has 30 givens; both player entries count, including the incorrect 9 at r1c3.
  expect(summary.filledCount).toBe(2)
  expect(summary.fillableCount).toBe(51)
  expect(summary.progressLabel).toBe('已填 2 / 51 格')
  expect(summarizeSave(makeSession()).progressLabel).toBe('已填 0 / 51 格')
})

it.each([
  { year: 2025, month: 11, day: 31, hour: 23, minute: 5, expected: '2025/12/31 23:05' },
  { year: 2027, month: 0, day: 1, hour: 0, minute: 7, expected: '2027/01/01 00:07' },
])('keeps the year and local wall time in save dates: $expected', (fixture) => {
  const startedAt = new Date(
    fixture.year,
    fixture.month,
    fixture.day,
    fixture.hour,
    fixture.minute,
  ).toISOString()

  const summary = summarizeSave(makeSession({ startedAt }))

  expect(summary.startedAtLabel).toBe(fixture.expected)
})

it('sorts recent saves first with a stable identity tie-break without mutating the catalog', () => {
  const startedAt = '2026-10-12T01:00:00.000Z'
  const saves = [
    makeSession({ id: 'b', startedAt }),
    makeSession({ id: 'older', startedAt: '2026-10-11T01:00:00.000Z' }),
    makeSession({ id: 'a', startedAt }),
  ].map((session) => ({ formatVersion: 2 as const, revision: 1, session }))

  const sorted = sortSavedSessions(saves)

  expect(sorted.map(({ session }) => session.id)).toEqual(['a', 'b', 'older'])
  expect(sortSavedSessions([...saves].reverse()).map(({ session }) => session.id)).toEqual([
    'a',
    'b',
    'older',
  ])
  expect(variantSaves(saves, 'classic').latest?.session.id).toBe('a')
  expect(saves.map(({ session }) => session.id)).toEqual(['b', 'older', 'a'])
})
