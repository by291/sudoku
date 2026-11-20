import { expect, it } from 'vitest'
import {
  getChallengeDate,
  getDailySeedMaterial,
  getDailyFormalId,
  getDailyIdentity,
  getDailyStatuses,
  restartDailySession,
} from '@/features/game/model/daily'
import { BOARD_SIZE } from '@/sudoku/values'
import { VARIANT_FIXTURES } from '../../../../tests/fixtures/variants'
import { makeSession } from '../../../../tests/support/gameFixtures'
import { applySessionAction } from '../../../../tests/support/semantics'

it('changes the challenge at Beijing midnight', () => {
  const beforeMidnight = new Date('2026-10-11T15:59:59.999Z')
  const atMidnight = new Date('2026-10-11T16:00:00.000Z')

  expect(getChallengeDate(beforeMidnight)).toBe('2026-10-11')
  expect(getChallengeDate(atMidnight)).toBe('2026-10-12')
})

it('encodes the day as exact ASCII seed material', () => {
  const material = getDailySeedMaterial('2026-10-11')

  expect(new TextDecoder('ascii').decode(material)).toBe('daily:2026-10-11')
})

it('rejects seed material for an invalid challenge date', () => {
  expect(() => getDailySeedMaterial('2026-02-30')).toThrow()
})

it('restarts daily entries while retaining identity, accumulated time and assistance', () => {
  let session = makeSession({
    id: 'daily:2026-10-11:formal',
    mode: 'daily',
    metadata: {
      kind: 'daily',
      challengeDate: '2026-10-11',
      formalAttempt: true,
    },
    elapsedMs: 71000,
    assistance: {
      assisted: true,
      hintCount: 2,
      checkCount: 1,
      candidateCount: 1,
    },
  })
  session = applySessionAction(session, {
    kind: 'toggle-note',
    cell: 3,
    digit: 6,
  }).session
  session = applySessionAction(session, {
    kind: 'enter',
    cell: 2,
    digit: 4,
  }).session
  session = applySessionAction(session, {
    kind: 'enter',
    cell: 5,
    digit: 8,
  }).session
  session = applySessionAction(session, { kind: 'undo' }).session
  const original = structuredClone(session)
  const emptyLayer = Array<number>(BOARD_SIZE).fill(0)

  expect(original.entries[2]).toBe(4)
  expect(original.notes[3]).toBe(32)
  expect(original.undoStack).toHaveLength(2)
  expect(original.redoStack).toHaveLength(1)

  const restarted = restartDailySession(session)

  expect(restarted).toEqual({
    ...original,
    entries: emptyLayer,
    notes: emptyLayer,
    undoStack: [],
    redoStack: [],
  })
  expect(session).toEqual(original)
})

it('keeps a completed daily attempt immutable when restart is requested', () => {
  const session = makeSession({
    id: 'daily:2026-10-11:formal',
    mode: 'daily',
    metadata: { kind: 'daily', challengeDate: '2026-10-11', formalAttempt: true },
    elapsedMs: 71000,
    completion: { elapsedMs: 71000, completedAt: '2026-10-11T01:02:00.000Z' },
  })
  session.entries = session.puzzle.solution.map((digit, cell) =>
    session.puzzle.givens[cell] === 0 ? digit : 0,
  )
  const original = structuredClone(session)

  const restarted = restartDailySession(session)

  expect(restarted).toEqual(original)
  expect(session).toEqual(original)
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
