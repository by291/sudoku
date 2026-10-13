import { expect, it } from 'vitest'
import { summarizeRecords } from '@/features/records/model/records'
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
