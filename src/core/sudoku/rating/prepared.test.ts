import { expect, it } from 'vitest'
import { assessPuzzleWithBudget, prepareAssessment } from '@/core/sudoku/rating/assessment'
import { createAssessmentInput } from '@/core/sudoku/rating/input'
import { createWorkBudget } from '@/core/sudoku/budget'
import { DIGITS } from '@/core/sudoku/types'
import { RATING_FIXTURES } from '../../../../tests/fixtures/rating'
import { solvedBoard, uniqueBoard } from '../../../../tests/fixtures/sudoku'

const limits = { maxSteps: 500, maxWork: 1000000 }

it.each(RATING_FIXTURES)('preserves the full assessment and charged work for $id', (fixture) => {
  const prepared = prepareAssessment(fixture.rules, limits)
  const preparedBudget = { limit: limits.maxWork, used: 100 }
  const freshBudget = { ...preparedBudget }
  const input = createAssessmentInput(fixture.board, fixture.rules, limits)

  const result = prepared.assess(fixture.board, preparedBudget)
  const expected = assessPuzzleWithBudget(input, freshBudget)

  expect(result).toEqual(expected)
  expect(preparedBudget).toEqual(freshBudget)
  expect(prepared.assess(fixture.board, createWorkBudget(limits.maxWork))).toEqual(
    assessPuzzleWithBudget(input, createWorkBudget(limits.maxWork)),
  )
})

it('owns the rule and limit snapshots across caller mutations', () => {
  const fixture = RATING_FIXTURES.find((item) => item.id === 'thermo-hard')
  if (!fixture || fixture.rules.kind !== 'thermo') {
    throw new Error('Missing Thermo Hard fixture')
  }

  const paths = fixture.rules.paths.map((path) => [...path])
  const rules = { kind: 'thermo' as const, paths }
  const mutableLimits = { ...limits }
  const input = createAssessmentInput(fixture.board, rules, mutableLimits)
  const expected = assessPuzzleWithBudget(input, createWorkBudget(limits.maxWork))
  const prepared = prepareAssessment(rules, mutableLimits)

  paths[0].reverse()
  mutableLimits.maxSteps = 0

  expect(prepared.assess(fixture.board, createWorkBudget(limits.maxWork))).toEqual(expected)
})

it('uses separate logical state and traces for every board', () => {
  const prepared = prepareAssessment({ kind: 'classic' }, limits)
  const board = [...uniqueBoard]
  const expected = prepared.assess(board, createWorkBudget(limits.maxWork))
  const result = prepared.assess(board, createWorkBudget(limits.maxWork))
  if (result.status !== 'rated' || !result.trace[0]) {
    throw new Error('Missing known unique trace')
  }

  result.trace[0].technique = 'x-wing'

  expect(prepared.assess(board, createWorkBudget(limits.maxWork))).toEqual(expected)
  expect(board).toEqual(uniqueBoard)
  expect(prepared.assess(solvedBoard, createWorkBudget(limits.maxWork))).toMatchObject({
    status: 'rated',
    summary: { workload: { steps: 0 } },
  })
})

it('validates each board and retains aggregate exhaustion', () => {
  const prepared = prepareAssessment({ kind: 'classic' }, limits)
  const budget = createWorkBudget(0)

  expect(prepared.assess([], createWorkBudget(10)).status).toBe('invalid')
  expect(prepared.assess(uniqueBoard, budget).status).toBe('budget-exhausted')
  expect(budget.used).toBe(0)
  expect(prepared.assess(uniqueBoard, { limit: 10, used: 11 }).status).toBe('invalid')
  expect(prepared.assess(uniqueBoard, { limit: limits.maxWork + 1, used: 0 }).status).toBe(
    'invalid',
  )
})

it('rejects invalid preparation rather than creating a successful default', () => {
  expect(() => prepareAssessment({ kind: 'thermo', paths: [] }, limits)).toThrow(TypeError)
  expect(() => prepareAssessment({ kind: 'classic' }, { ...limits, maxSteps: -1 })).toThrow(
    TypeError,
  )
})

function reverseClueGeometry(value: unknown, visited = new Set<object>()): void {
  if (typeof value !== 'object' || value === null) {
    return
  }

  // Shared premises may recur in a trace; reverse each array once so edits cannot cancel.
  if (visited.has(value)) {
    return
  }

  visited.add(value)

  for (const [key, member] of Object.entries(value)) {
    if (
      Array.isArray(member) &&
      !visited.has(member) &&
      (key === 'cells' || key === 'path' || key === 'shaft')
    ) {
      member.reverse()
    }

    reverseClueGeometry(member, visited)
  }
}

it.each(['killer-hard', 'thermo-hard', 'arrow-hard'])(
  'isolates cached geometry from returned nested evidence for %s',
  (id) => {
    const fixture = RATING_FIXTURES.find((item) => item.id === id)
    if (!fixture) {
      throw new Error(`Missing ${id} fixture`)
    }

    const prepared = prepareAssessment(fixture.rules, limits)
    const expected = prepared.assess(fixture.board, createWorkBudget(limits.maxWork))
    const result = prepared.assess(fixture.board, createWorkBudget(limits.maxWork))
    if (result.status !== 'rated') {
      throw new Error('Missing known rated trace')
    }

    reverseClueGeometry(result.trace)

    expect(prepared.assess(fixture.board, createWorkBudget(limits.maxWork))).toEqual(expected)
  },
)

it('owns variant evidence digits instead of exposing the engine constant', () => {
  const fixture = RATING_FIXTURES.find((item) => item.id === 'thermo-hard')
  if (!fixture) {
    throw new Error('Missing Thermo Hard fixture')
  }

  const prepared = prepareAssessment(fixture.rules, limits)
  const result = prepared.assess(fixture.board, createWorkBudget(limits.maxWork))
  if (result.status !== 'rated') {
    throw new Error('Missing known rated trace')
  }

  const step = result.trace.find((item) => item.evidence.kind === 'thermo')
  if (!step) {
    throw new Error('Missing Thermo evidence')
  }

  expect(step.evidence.digits).toEqual(DIGITS)
  expect(step.evidence.digits).not.toBe(DIGITS)
})
