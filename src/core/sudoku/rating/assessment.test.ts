import { prepareRuleComputation } from '@/core/sudoku/constraints/computation'
import {
  prepareAssessmentWithComputation,
  assessPuzzle,
  assessPuzzleWithBudget,
  toAssessmentOutcome,
} from '@/core/sudoku/rating/assessment'
import { createAssessmentInput } from '@/core/sudoku/rating/input'
import { expect, it } from 'vitest'
import type { AssessmentResult } from '@/core/sudoku/rating/types'
import { RATING_POLICIES } from '@/core/sudoku/rating/policies'
import { analyzeLogic } from '@/core/sudoku/logic/solver'
import { compileRules } from '@/core/sudoku/rules/context'
import { createWorkBudget } from '@/core/sudoku/budget'
import type { Technique } from '@/core/sudoku/logic/types'
import type { Board } from '@/core/sudoku/types'
import { RATING_FIXTURES } from '../../../../tests/fixtures/rating'
import {
  solvedBoard,
  uniqueBoard,
  conflictingBoard,
  emptyBoard,
} from '../../../../tests/fixtures/sudoku'
import { VARIANT_FIXTURES } from '../../../../tests/fixtures/variants'
import { RATING_WITNESSES } from '../../../../tests/fixtures/ratingWitnesses'
import { referenceRatingState } from '../../../../tests/support/referenceRatingState'

function rated(result: AssessmentResult) {
  expect(result.status).toBe('rated')
  if (result.status !== 'rated') {
    throw new Error(`Expected rated result, received ${result.status}`)
  }

  return result
}

it('consumes a supplied budget across assessments without resetting it', () => {
  const board: Board = solvedBoard.map((digit, cell) => (cell === 40 ? 0 : digit))
  const input = createAssessmentInput(board, { kind: 'classic' })
  const budget = createWorkBudget(2)

  expect(assessPuzzleWithBudget(input, budget)).toEqual(assessPuzzle(input))
  expect(budget.used).toBe(1)
  expect(assessPuzzleWithBudget(input, budget).status).toBe('rated')
  expect(budget.used).toBe(2)
  expect(assessPuzzleWithBudget(input, budget).status).toBe('budget-exhausted')
  expect(budget.used).toBe(2)
})

it.each([
  { limit: -1, used: 0 },
  { limit: 1, used: -1 },
  { limit: 1, used: 2 },
  { limit: 4000001, used: 0 },
  { limit: 1, used: NaN },
  { limit: 1.5, used: 0 },
])('rejects invalid caller-owned assessment budgets %j', (budget) => {
  expect(
    assessPuzzleWithBudget(createAssessmentInput(uniqueBoard, { kind: 'classic' }), budget).status,
  ).toBe('invalid')
})

it('rates a one-hole board with exact placement statistics', () => {
  const board: Board = solvedBoard.map((digit, cell) => (cell === 40 ? 0 : digit))
  const result = rated(assessPuzzle(createAssessmentInput(board, { kind: 'classic' })))

  expect(result.summary).toMatchObject({
    ratingVersion: 'sudoku-rating-v2',
    variant: 'classic',
    difficulty: 'easy',
    workload: {
      steps: 1,
      placements: 1,
      eliminations: 0,
      candidateRemovals: 0,
      highestTier: 'easy',
      highestTechnique: 'naked-single',
      variantSteps: 0,
    },
  })
  expect(Object.values(result.summary.workload.techniqueCounts).reduce((a, b) => a + b, 0)).toBe(1)
  expect(result.summary.workload.techniqueCounts['naked-single']).toBe(1)
  expect(result.trace).toMatchObject([{ kind: 'placement', cell: 40, digit: 5 }])
  expect(toAssessmentOutcome(result)).toEqual({ status: 'rated', summary: result.summary })
})

it('rates a completed board without inventing a technique even with zero limits', () => {
  const result = rated(
    assessPuzzle(
      createAssessmentInput(solvedBoard, { kind: 'classic' }, { maxSteps: 0, maxWork: 0 }),
    ),
  )

  expect(result.summary.workload).toMatchObject({
    steps: 0,
    placements: 0,
    eliminations: 0,
    candidateRemovals: 0,
    highestTier: null,
    highestTechnique: null,
    variantSteps: 0,
  })
  expect(Object.values(result.summary.workload.techniqueCounts)).toEqual(Array(17).fill(0))
  expect(result.trace).toEqual([])
})

it.each(RATING_FIXTURES)('matches a fresh successful-policy trace for $id', (fixture) => {
  const result = rated(assessPuzzle(createAssessmentInput(fixture.board, fixture.rules)))
  const independentRun = analyzeLogic(
    fixture.board,
    RATING_POLICIES[fixture.rules.kind][fixture.difficulty],
    500,
    { context: compileRules(fixture.rules), workBudget: createWorkBudget(1000000) },
  )

  expect(result.trace).toEqual(independentRun.steps)
  expect(result.summary.workload.steps).toBe(independentRun.steps.length)
})

it('finishes the prepared authored Killer Hard trace without repeating lower-policy work', () => {
  const fixture = RATING_FIXTURES.find((item) => item.id === 'killer-hard')
  if (!fixture) {
    throw new Error('Missing known Killer Hard fixture')
  }
  const prepared = prepareRuleComputation(fixture.rules, createWorkBudget(100000))
  if (prepared.status !== 'ready') {
    throw new Error('Expected charged fixture preparation')
  }
  const budget = createWorkBudget(15000)
  const owner = prepareAssessmentWithComputation(prepared.computation, {
    maxSteps: 500,
    maxWork: 4000000,
  })

  const result = rated(owner.assess(fixture.board, budget))

  expect(result.summary.difficulty).toBe('hard')
  expect(result.trace).toEqual(
    analyzeLogic(fixture.board, RATING_POLICIES.killer.hard, 500, {
      context: compileRules(fixture.rules),
      workBudget: createWorkBudget(1000000),
    }).steps,
  )
  expect(budget.used).toBeLessThanOrEqual(budget.limit)
})

it('restarts from original candidates when a higher policy changes technique priorities', () => {
  const fixture = RATING_FIXTURES.find((item) => item.id === 'killer-medium')
  if (!fixture) {
    throw new Error('Missing known Killer Medium fixture')
  }
  const policies = RATING_POLICIES.killer
  const descriptor = Object.getOwnPropertyDescriptor(policies, 'medium')
  if (!descriptor) {
    throw new Error('Missing policy descriptor')
  }
  const changedPriority = [
    'cage-combination',
    ...policies.medium.filter((technique) => technique !== 'cage-combination'),
  ] satisfies readonly Technique[]

  try {
    Object.defineProperty(policies, 'medium', { ...descriptor, value: changedPriority })
    const result = rated(assessPuzzle(createAssessmentInput(fixture.board, fixture.rules)))
    const fresh = analyzeLogic(fixture.board, changedPriority, 500, {
      context: compileRules(fixture.rules),
      workBudget: createWorkBudget(1000000),
    })

    expect(fresh.status).toBe('solved')
    expect(result.summary.difficulty).toBe('medium')
    expect(result.trace).toEqual(fresh.steps)
  } finally {
    Object.defineProperty(policies, 'medium', descriptor)
  }
})

it('retains the independently authored Classic Hard pair in the complete trace', () => {
  const fixture = RATING_FIXTURES.find((item) => item.id === 'classic-hard')
  if (!fixture) {
    throw new Error('Missing known hard fixture')
  }
  const result = rated(assessPuzzle(createAssessmentInput(fixture.board, fixture.rules)))

  // The authored hard fixture requires the row-4 pair {2, 4} in cells 33 and 34.
  expect(result.trace).toContainEqual(
    expect.objectContaining({
      technique: 'naked-pair',
      evidence: expect.objectContaining({ cells: [33, 34], digits: [2, 4] }),
    }),
  )
})

it.each(
  RATING_FIXTURES.filter(
    (fixture) => fixture.difficulty !== 'easy' && fixture.difficulty !== 'expert',
  ),
)(
  'proves a fixed higher-tier deduction for $id independently of production detectors',
  (fixture) => {
    const witness = RATING_WITNESSES[fixture.id]
    if (!witness) {
      throw new Error(`Missing fixed witness: ${fixture.id}`)
    }
    const result = rated(assessPuzzle(createAssessmentInput(fixture.board, fixture.rules)))
    const index = result.trace.findIndex((step) => step.technique === witness.technique)
    expect(index).toBeGreaterThanOrEqual(0)
    const step = result.trace[index]
    const state = referenceRatingState(fixture.board, fixture.rules, result.trace.slice(0, index))

    // Literal candidate facts are checked by a separate peer-and-action replay, not engine masks.
    for (const [cell, digits] of witness.domains) {
      const actual = state.board[cell] === 0 ? state.candidates[cell] : [state.board[cell]]
      expect(actual, `${fixture.id} cell ${cell}`).toEqual(digits)
    }
    if (witness.technique === 'arrow-combination') {
      expect(fixture.rules).toMatchObject({
        kind: 'arrow',
        arrows: expect.arrayContaining([{ circle: 8, shaft: [16, 24, 32, 40] }]),
      })
      expect(step).toMatchObject({
        kind: 'placement',
        technique: 'arrow-combination',
        cell: 24,
        digit: 1,
        evidence: {
          kind: 'arrow',
          circle: 8,
          shaft: [16, 24, 32, 40],
          domains: witness.domains.map(([cell, digits]) => ({
            cell,
            mask: digits.reduce((mask, digit) => mask | (1 << (digit - 1)), 0),
          })),
        },
      })
      // 8 = 2 + x + 3 + y; these explicit domains permit only x=1, y=2.
      const pairs = [1, 5, 7, 9].flatMap((x) =>
        [2, 4].filter((y) => x + y === 3).map((y) => [x, y]),
      )
      expect(pairs).toEqual([[1, 2]])
      return
    }

    expect(step).toMatchObject({
      kind: 'elimination',
      technique: witness.technique,
      removals: witness.removals,
      evidence: {
        kind: 'unit',
        unit: witness.unit,
        cells: witness.cells,
        digits: witness.digits,
        premises: [],
      },
    })
    const unit = state.units.get(`${witness.unit.kind}:${witness.unit.index}`)
    if (!unit) {
      throw new Error(`Missing independent unit: ${fixture.id}`)
    }
    const positions = (digit: number) =>
      unit.filter((cell) => state.candidates[cell].includes(digit))
    if (witness.technique === 'locked-candidate') {
      expect(positions(witness.digits[0])).toEqual(witness.cells)
      const target = state.units.get(`${witness.target.kind}:${witness.target.index}`)
      if (!target) {
        throw new Error(`Missing independent target: ${fixture.id}`)
      }
      for (const cell of witness.cells) {
        expect(target).toContain(cell)
      }
      for (const removal of witness.removals) {
        expect(target).toContain(removal.cell)
        expect(unit).not.toContain(removal.cell)
        expect(removal.digit).toBe(witness.digits[0])
      }
    } else if (witness.technique === 'naked-pair') {
      for (const cell of witness.cells) {
        expect(unit).toContain(cell)
        expect(state.candidates[cell]).toEqual(witness.digits)
      }
      for (const removal of witness.removals) {
        expect(unit).toContain(removal.cell)
        expect(witness.cells).not.toContain(removal.cell)
        expect(witness.digits).toContain(removal.digit)
      }
    } else {
      for (const digit of witness.digits) {
        expect(positions(digit)).toEqual(witness.cells)
      }
      for (const removal of witness.removals) {
        expect(witness.cells).toContain(removal.cell)
        expect(witness.digits).not.toContain(removal.digit)
      }
    }
    for (const removal of witness.removals) {
      expect(state.candidates[removal.cell]).toContain(removal.digit)
    }
  },
)

it('returns distinct invalid, ungraded and budget-exhausted outcomes', () => {
  expect(assessPuzzle(createAssessmentInput(conflictingBoard, { kind: 'classic' })).status).toBe(
    'invalid',
  )
  expect(assessPuzzle(createAssessmentInput(emptyBoard, { kind: 'classic' }))).toMatchObject({
    status: 'ungraded',
  })
  expect(
    assessPuzzle(
      createAssessmentInput(uniqueBoard, { kind: 'classic' }, { maxSteps: 0, maxWork: 1000000 }),
    ),
  ).toMatchObject({ status: 'budget-exhausted', stage: 'logic', difficulty: 'easy' })
  expect(
    assessPuzzle(
      createAssessmentInput(uniqueBoard, { kind: 'classic' }, { maxSteps: 500, maxWork: 0 }),
    ),
  ).toMatchObject({ status: 'budget-exhausted' })
  const thermo = VARIANT_FIXTURES.thermo

  expect(
    assessPuzzle(createAssessmentInput(thermo.givens, thermo.rules, { maxSteps: 500, maxWork: 0 })),
  ).toMatchObject({ status: 'budget-exhausted', stage: 'validation' })
  const wrong = thermo.solution.map((digit, cell) => (cell === 0 ? 9 : digit))
  expect(assessPuzzle(createAssessmentInput(wrong, thermo.rules)).status).toBe('invalid')
})
