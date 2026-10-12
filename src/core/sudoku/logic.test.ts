import { expect, it } from 'vitest'
import { findLogicalStep, analyzeLogic, rateDifficulty } from '@/core/sudoku/logic'
import { explainStep, TECHNIQUES } from '@/core/sudoku/techniques'
import { emptyBoard, uniqueBoard, solvedBoard } from '../../../tests/fixtures/sudoku'
import { createLogicalWorkspace } from '@/core/sudoku/logic'
import type { Technique, LogicalStep } from '@/core/sudoku/techniques'
import type { LogicalState } from '@/core/sudoku/techniques'

function state(candidates: number[]): LogicalState {
  return { board: emptyBoard, candidates }
}
it.each([0, 9, 80])('places a naked single at cell %i with its evidence', (cell) => {
  const candidates = Array(81).fill(511)
  candidates[cell] = 16
  expect(classicStep(state(candidates), ['naked-single'])).toMatchObject({
    kind: 'placement',
    cell,
    digit: 5,
    evidence: { cells: [cell], digits: [5] },
  })
})
it('places a hidden single instead of confusing it with a naked single', () => {
  const candidates = Array(81).fill(511)
  for (let cell = 1; cell < 9; cell++) candidates[cell] = 510
  expect(classicStep(state(candidates), ['hidden-single'])).toMatchObject({
    kind: 'placement',
    cell: 0,
    digit: 1,
    evidence: { unit: { kind: 'row', index: 0 } },
  })
})

it.each([
  { kind: 'column', cells: [0, 9, 18, 27, 36, 45, 54, 63, 72] },
  { kind: 'box', cells: [0, 1, 2, 9, 10, 11, 18, 19, 20] },
])('finds hidden singles in a $kind', ({ kind, cells }) => {
  const candidates = Array(81).fill(511)
  for (const cell of cells.slice(1)) candidates[cell] = 510
  expect(classicStep(state(candidates), ['hidden-single'])).toMatchObject({
    kind: 'placement',
    cell: 0,
    digit: 1,
    evidence: { unit: { kind, index: 0 } },
  })
})

it.each([
  { kind: 'column', cells: [0, 9, 18, 27, 36, 45, 54, 63, 72] },
  { kind: 'box', cells: [0, 10, 1, 2, 9, 11, 18, 19, 20] },
])('finds naked pairs in a $kind', ({ kind, cells }) => {
  const candidates = Array(81).fill(511)
  candidates[cells[0]] = candidates[cells[1]] = 3
  candidates[cells[2]] = 7
  for (const cell of cells.slice(3)) candidates[cell] = 508
  expect(classicStep(state(candidates), ['naked-pair'])).toMatchObject({
    kind: 'elimination',
    evidence: { unit: { kind, index: 0 } },
    removals: [
      { cell: cells[2], digit: 1 },
      { cell: cells[2], digit: 2 },
    ],
  })
})

it('does not eliminate a hidden pair when a digit has a third location', () => {
  const candidates = Array(81).fill(511)
  candidates[0] = 7
  candidates[1] = 11
  for (let cell = 2; cell < 9; cell++) candidates[cell] = 508
  candidates[2] = 510
  expect(classicStep(state(candidates), ['hidden-pair'])).toBeNull()
})

it('does not infer a locked digit whose box locations span rows and columns', () => {
  expect(classicStep(state(Array(81).fill(511)), ['locked-candidate'])).toBeNull()
})
it('eliminates only the two naked-pair digits from other cells', () => {
  const candidates = Array(81).fill(511)
  candidates[0] = candidates[1] = 3
  candidates[2] = 7
  for (let cell = 3; cell < 9; cell++) candidates[cell] = 508
  const step = classicStep(state(candidates), ['naked-pair'])
  expect(step).toMatchObject({
    kind: 'elimination',
    removals: [
      { cell: 2, digit: 1 },
      { cell: 2, digit: 2 },
    ],
    evidence: { cells: [0, 1], digits: [1, 2] },
  })
  expect(step && explainStep(step)).toContain('显性数对')
})
it('does not treat three cells with the same pair as a naked pair', () => {
  const candidates = Array(81).fill(511)
  candidates[0] = candidates[1] = candidates[2] = 3
  expect(classicStep(state(candidates), ['naked-pair'])).toBeNull()
})
it('removes extra digits from a hidden pair but preserves the pair', () => {
  const candidates = Array(81).fill(511)
  candidates[0] = 7
  candidates[1] = 11
  for (let cell = 2; cell < 9; cell++) candidates[cell] = 508
  expect(classicStep(state(candidates), ['hidden-pair'])).toMatchObject({
    kind: 'elimination',
    removals: [
      { cell: 0, digit: 3 },
      { cell: 1, digit: 4 },
    ],
    evidence: { cells: [0, 1], digits: [1, 2] },
  })
})
it('points a box digit into one row', () => {
  const candidates = Array(81).fill(511)
  for (const cell of [2, 9, 10, 11, 18, 19, 20]) candidates[cell] = 510
  expect(classicStep(state(candidates), ['locked-candidate'])).toMatchObject({
    kind: 'elimination',
    evidence: { unit: { kind: 'box', index: 0 }, cells: [0, 1], digits: [1] },
    removals: [3, 4, 5, 6, 7, 8].map((cell) => ({ cell, digit: 1 })),
  })
})
it('claims a row digit inside one box', () => {
  const candidates = Array(81).fill(511)
  for (let cell = 2; cell < 9; cell++) candidates[cell] = 510
  expect(classicStep(state(candidates), ['locked-candidate'])).toMatchObject({
    kind: 'elimination',
    evidence: { unit: { kind: 'row', index: 0 } },
    removals: [9, 10, 11, 18, 19, 20].map((cell) => ({ cell, digit: 1 })),
  })
})
it('solves the known easy puzzle using singles and preserves its input', () => {
  expect(analyzeLogic(uniqueBoard, TECHNIQUES.slice(0, 2), 500)).toMatchObject({
    status: 'solved',
    board: solvedBoard,
  })
  expect(rateDifficulty(uniqueBoard, 500)).toBe('easy')
  expect(analyzeLogic(uniqueBoard, TECHNIQUES, 0).status).toBe('budget-exhausted')
})

function classicStep(state: LogicalState, techniques: readonly Technique[]): LogicalStep | null {
  const workspace = createLogicalWorkspace(state.board)
  workspace.candidates = [...state.candidates]
  const result = findLogicalStep(workspace, techniques)
  if (result.status !== 'complete') throw new Error('Unexpected Classic budget exhaustion')
  return result.step
}
