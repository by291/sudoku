import { expect, it } from 'vitest'
import { getChallengeDate, getDailySeed, restartDailySession } from './daily'
import { makeSession } from '../../../tests/support/gameFixtures'
it('changes the challenge at Beijing midnight with a versioned stable seed', () => {
  expect(getChallengeDate(new Date('2026-10-11T15:59:59.999Z'))).toBe('2026-10-11')
  expect(getChallengeDate(new Date('2026-10-11T16:00:00.000Z'))).toBe('2026-10-12')
  expect(getDailySeed('2026-10-11', 'sudoku-v1')).toBe('daily:sudoku-v1:2026-10-11')
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
