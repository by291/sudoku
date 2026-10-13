import { expect, it } from 'vitest'
import {
  getChallengeDate,
  getDailySeed,
  getDailyIdentity,
  getDailyStatuses,
  restartDailySession,
} from '@/features/game/model/daily'
import { VARIANT_FIXTURES } from '../../../../tests/fixtures/variants'
import { makeSession } from '../../../../tests/support/gameFixtures'

it('changes the challenge at Beijing midnight with a versioned stable seed', () => {
  expect(getChallengeDate(new Date('2026-10-11T15:59:59.999Z'))).toBe('2026-10-11')
  expect(getChallengeDate(new Date('2026-10-11T16:00:00.000Z'))).toBe('2026-10-12')
  expect(getDailySeed('2026-10-11', 'sudoku-v2')).toBe('daily:sudoku-v2:2026-10-11')
  expect(() => getDailySeed('2026-02-30', 'v1')).toThrow()
})
it('restarts daily entries while retaining identity, accumulated time and assistance', () => {
  const session = makeSession({
    id: 'daily:2026-10-11:formal',
    mode: 'daily',
    metadata: { kind: 'daily', challengeDate: '2026-10-11', formalAttempt: true },
    elapsedMs: 71000,
    assistance: { assisted: true, hintCount: 2, checkCount: 1, candidateCount: 1 },
  })
  const restarted = restartDailySession(session)

  expect(restarted).toMatchObject({
    id: session.id,
    metadata: session.metadata,
    elapsedMs: 71000,
    assistance: session.assistance,
  })
  expect(restarted.entries.every((value) => value === 0)).toBe(true)
  expect(restarted.notes.every((value) => value === 0)).toBe(true)
})
it('uses distinct formal daily identities without rewriting Classic', () => {
  expect(getDailyIdentity('2026-10-11', 'classic')).toMatchObject({
    seed: 'daily:sudoku-v2:2026-10-11',
    formalId: 'daily:2026-10-11:formal',
    input: { variant: 'classic', difficulty: 'medium' },
  })
  expect(getDailyIdentity('2026-10-11', 'arrow')).toMatchObject({
    seed: 'daily:sudoku-variants-v2:arrow:2026-10-11',
    formalId: 'daily:arrow:2026-10-11:formal',
    input: { variant: 'arrow', difficulty: 'medium' },
  })
})
it('reports six independent statuses without counting practice replays', () => {
  const classic = makeSession({
    id: 'daily:2026-10-11:formal',
    mode: 'daily',
    metadata: { kind: 'daily', challengeDate: '2026-10-11', formalAttempt: true },
    completion: { elapsedMs: 0, completedAt: '2026-10-11T01:00:00.000Z' },
  })
  const arrow = makeSession({
    id: 'daily:arrow:2026-10-11:formal',
    mode: 'daily',
    metadata: classic.metadata,
    puzzle: { ...classic.puzzle, ...VARIANT_FIXTURES.arrow },
  })
  const practice = {
    ...arrow,
    id: 'arrow-practice',
    metadata: { kind: 'daily' as const, challengeDate: '2026-10-11', formalAttempt: false },
    completion: classic.completion,
  }

  expect(
    getDailyStatuses(
      [{ session: arrow }],
      [{ session: classic }, { session: practice }],
      '2026-10-11',
    ),
  ).toEqual([
    { variant: 'classic', state: 'completed' },
    { variant: 'diagonal', state: 'available' },
    { variant: 'jigsaw', state: 'available' },
    { variant: 'killer', state: 'available' },
    { variant: 'thermo', state: 'available' },
    { variant: 'arrow', state: 'in-progress' },
  ])
})
