import { expect, it } from 'vitest'
import {
  getChallengeDate,
  getDailySeedMaterial,
  getDailyFormalId,
  getDailyIdentity,
  getDailyStatuses,
  restartDailySession,
} from '@/features/game/model/daily'
import { VARIANT_FIXTURES } from '../../../../tests/fixtures/variants'
import { makeSession } from '../../../../tests/support/gameFixtures'

it('changes the challenge at Beijing midnight with exact ASCII seed material', () => {
  expect(getChallengeDate(new Date('2026-10-11T15:59:59.999Z'))).toBe('2026-10-11')
  expect(getChallengeDate(new Date('2026-10-11T16:00:00.000Z'))).toBe('2026-10-12')
  expect(Array.from(getDailySeedMaterial('2026-10-11'))).toEqual([
    100, 97, 105, 108, 121, 58, 50, 48, 50, 54, 45, 49, 48, 45, 49, 49,
  ])
  expect(() => getDailySeedMaterial('2026-02-30')).toThrow()
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
it('uses current seeds and stable type-specific formal daily identities', () => {
  expect(getDailyFormalId('2026-10-11', 'classic')).toBe('daily:2026-10-11:formal')
  expect(getDailyIdentity('2026-10-11', 'classic', new Uint8Array(32))).toMatchObject({
    seed: new Uint8Array(32),
    formalId: 'daily:2026-10-11:formal',
    input: { variant: 'classic', difficulty: 'medium' },
  })
  expect(getDailyIdentity('2026-10-11', 'arrow', new Uint8Array(32))).toMatchObject({
    seed: new Uint8Array(32),
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
