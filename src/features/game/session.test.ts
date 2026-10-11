import { expect, it } from 'vitest'
import { applySessionAction, completeSession, createSession } from './session'
import { makeSession } from '../../../tests/support/gameFixtures'
import { emptyBoard, solvedBoard } from '../../../tests/fixtures/sudoku'
it('initializes entries independently from givens', () => {
  const fixture = makeSession()
  const session = createSession(fixture.puzzle, fixture.metadata, fixture.id, fixture.startedAt)
  expect(session).toEqual(fixture)
})
it('protects givens and treats repeated values as no-ops', () => {
  const session = makeSession()
  expect(applySessionAction(session, { kind: 'enter', cell: 0, digit: 9 }).changed).toBe(false)
  const entered = applySessionAction(session, { kind: 'enter', cell: 2, digit: 4 }).session
  expect(entered.entries[2]).toBe(4)
  expect(applySessionAction(entered, { kind: 'enter', cell: 2, digit: 4 }).changed).toBe(false)
  expect(entered.undoStack).toHaveLength(1)
})
it('records peer notes atomically and restores both layers through undo and redo', () => {
  let session = makeSession()
  session = applySessionAction(session, { kind: 'toggle-note', cell: 2, digit: 4 }).session
  session = applySessionAction(session, { kind: 'toggle-note', cell: 3, digit: 4 }).session
  expect(session.notes[2]).toBe(8)
  const before = session
  session = applySessionAction(session, { kind: 'enter', cell: 2, digit: 4 }).session
  expect(session.notes[2]).toBe(0)
  expect(session.notes[3]).toBe(0)
  const undone = applySessionAction(session, { kind: 'undo' }).session
  expect(undone.entries).toEqual(before.entries)
  expect(undone.notes).toEqual(before.notes)
  const redone = applySessionAction(undone, { kind: 'redo' }).session
  expect(redone.entries[2]).toBe(4)
  expect(redone.notes[3]).toBe(0)
  const erased = applySessionAction(redone, { kind: 'erase', cell: 2 }).session
  expect(erased.entries[2]).toBe(0)
  expect(erased.notes[3]).toBe(0)
  expect(
    applySessionAction(undone, { kind: 'enter', cell: 2, digit: 1 }).session.redoStack,
  ).toHaveLength(0)
})
it('never reverses assistance through history changes', () => {
  let session = makeSession()
  for (const kind of ['hint-shown', 'check', 'generate-notes'] satisfies (
    'hint-shown' | 'check' | 'generate-notes'
  )[])
    session = applySessionAction(session, { kind }).session
  session = applySessionAction(session, { kind: 'undo' }).session
  expect(session.assistance).toEqual({
    hintCount: 1,
    checkCount: 1,
    candidateCount: 1,
    assisted: true,
  })
  expect(session.notes).toEqual(Array(81).fill(0))
  expect(
    applySessionAction(session, { kind: 'generate-notes' }).session.assistance.candidateCount,
  ).toBe(2)
})
it('completes only a valid full board and locks its first result', () => {
  const session = makeSession({
    puzzle: { ...makeSession().puzzle, givens: emptyBoard },
    entries: solvedBoard,
  })
  const completed = completeSession(session, '2026-10-11T01:05:00.000Z', 300000)
  expect(completed.completion).toEqual({
    completedAt: '2026-10-11T01:05:00.000Z',
    elapsedMs: 300000,
  })
  expect(completeSession(completed, '2026-10-11T01:06:00.000Z', 360000)).toBe(completed)
  expect(applySessionAction(completed, { kind: 'undo' }).changed).toBe(false)
  expect(applySessionAction(completed, { kind: 'enter', cell: 2, digit: 1 }).changed).toBe(false)
  const invalid = makeSession({ ...session, entries: Array(81).fill(1) })
  expect(completeSession(invalid, '2026-10-11T01:05:00.000Z', 1).completion).toBeNull()
})
