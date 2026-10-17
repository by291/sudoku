import { expect, it } from 'vitest'
import {
  groupCompletedSummaries,
  modeName,
  sessionLink,
  summarizeProjection,
} from '@/features/records/model/records'
import { projectRecord } from '@/storage/projections'
import { makeSession } from '../../../../tests/support/gameFixtures'

it('groups the ordered summary page by local completion dates', () => {
  const rows = [
    { id: 'latest', completedAt: new Date(2026, 9, 11, 16, 0).toISOString() },
    { id: 'first', completedAt: new Date(2026, 9, 11, 0, 1).toISOString() },
    { id: 'older', completedAt: new Date(2026, 9, 10, 23, 59).toISOString() },
  ].map(({ id, completedAt }) =>
    projectRecord(makeSession({ id, completion: { completedAt, elapsedMs: 0 } }), 0, 'results'),
  )
  rows.push(projectRecord(makeSession({ id: 'unfinished' }), 1, 'sessions'))

  const groups = groupCompletedSummaries(rows)

  // Pages already have repository ordering; grouping preserves that ordering within each date.
  expect(groups.map((group) => [group.date, group.records.map(({ id }) => id)])).toEqual([
    ['2026-10-11', ['latest', 'first']],
    ['2026-10-10', ['older']],
  ])
})

it('formats compact saved progress independently of notes and entry correctness', () => {
  const entries = [...makeSession().entries]
  entries[2] = 9
  entries[3] = 6
  const notes = [...makeSession().notes]
  notes[5] = 511
  const projection = projectRecord(makeSession({ entries, notes }), 1, 'sessions')

  const summary = summarizeProjection(projection)

  // The fixture has 30 givens; both player entries count, including the incorrect 9 at r1c3.
  expect(summary.filledCount).toBe(2)
  expect(summary.fillableCount).toBe(51)
  expect(summary.progressLabel).toBe('已填 2 / 51 格')
  expect(summarizeProjection(projectRecord(makeSession(), 1, 'sessions')).progressLabel).toBe(
    '已填 0 / 51 格',
  )
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
  const projection = projectRecord(makeSession({ startedAt }), 1, 'sessions')

  const summary = summarizeProjection(projection)

  expect(summary.startedAtLabel).toBe(fixture.expected)
})

it('links compact summaries and full sessions to the same player route', () => {
  const session = makeSession({
    id: 'practice / one',
    mode: 'learning',
    metadata: { kind: 'learning', lessonId: 'hidden / pair' },
  })
  const projection = projectRecord(session, 1, 'sessions')

  expect(sessionLink(projection)).toBe(
    '/learn/hidden%20%2F%20pair?practice=1&variant=classic&session=practice%20%2F%20one',
  )
  expect(sessionLink(session)).toBe(sessionLink(projection))
  expect(modeName(projection)).toBe('学习实战')
})

it.each([
  { formalAttempt: true, expected: '2026-10-11 · 每日正式挑战' },
  { formalAttempt: false, expected: '2026-10-11 · 每日练习' },
])('labels daily summary eligibility: $expected', ({ formalAttempt, expected }) => {
  const projection = projectRecord(
    makeSession({
      id: 'daily',
      mode: 'daily',
      metadata: { kind: 'daily', challengeDate: '2026-10-11', formalAttempt },
    }),
    1,
    'sessions',
  )

  expect(modeName(projection)).toBe(expected)
  expect(sessionLink(projection)).toBe('/play/daily?variant=classic&session=daily')
})
