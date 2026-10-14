import { expect, it } from 'vitest'
import {
  assessPuzzle,
  assessPuzzleWithBudget,
  createAssessmentInput,
  parseAssessmentInput,
  summarizeLogicalTrace,
  toAssessmentOutcome,
  parseAssessmentSummary,
  parseAssessmentOutcome,
  decodePuzzleAssessment,
  toPuzzleAssessment,
} from '@/core/sudoku/rating'
import type { AssessmentResult } from '@/core/sudoku/rating'
import { RATING_POLICIES, TECHNIQUE_TIERS } from '@/core/sudoku/ratingPolicies'
import { analyzeLogic } from '@/core/sudoku/logic'
import { compileRules } from '@/core/sudoku/rules'
import { createWorkBudget } from '@/core/sudoku/budget'
import type { LogicalStep, Technique } from '@/core/sudoku/techniques'
import type { Board } from '@/core/sudoku/types'
import { RATING_FIXTURES } from '../../../tests/fixtures/rating'
import {
  solvedBoard,
  uniqueBoard,
  conflictingBoard,
  emptyBoard,
} from '../../../tests/fixtures/sudoku'
import { referenceCountSolutions } from '../../../tests/support/referenceVariants'
import { VARIANT_FIXTURES } from '../../../tests/fixtures/variants'
import { RATING_WITNESSES } from '../../../tests/fixtures/ratingWitnesses'
import { referenceRatingState } from '../../../tests/support/referenceRatingState'

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

it.each(RATING_FIXTURES)(
  'rates $id with independently verified conclusions',
  (fixture) => {
    const original = JSON.stringify(fixture)
    const result = rated(assessPuzzle(createAssessmentInput(fixture.board, fixture.rules)))

    expect(result.summary.variant).toBe(fixture.rules.kind)
    expect(result.summary.difficulty).toBe(fixture.difficulty)
    expect(parseAssessmentSummary(result.summary)).toEqual({ valid: true, value: result.summary })
    expect(referenceCountSolutions(fixture.board, fixture.rules)).toEqual({
      count: 1,
      solution: fixture.solution,
    })
    const board = [...fixture.board]
    let removalCount = 0
    let placementCount = 0

    for (const step of result.trace) {
      if (step.kind === 'placement') {
        expect(board[step.cell]).toBe(0)
        expect(step.digit).toBe(fixture.solution[step.cell])
        board[step.cell] = step.digit
        placementCount++
      } else {
        expect(step.removals.length).toBeGreaterThan(0)
        expect(new Set(step.removals.map(({ cell, digit }) => `${cell}:${digit}`)).size).toBe(
          step.removals.length,
        )
        for (const removal of step.removals) {
          expect(removal.digit).not.toBe(fixture.solution[removal.cell])
        }
        removalCount += step.removals.length
      }
    }

    expect(board).toEqual(fixture.solution)
    expect(result.summary.workload.placements).toBe(placementCount)
    expect(result.summary.workload.eliminations).toBe(result.trace.length - placementCount)
    expect(result.summary.workload.candidateRemovals).toBe(removalCount)
    expect(
      Object.values(result.summary.workload.techniqueCounts).reduce((sum, count) => sum + count, 0),
    ).toBe(result.trace.length)
    expect(result.summary.workload.highestTier).toBe(fixture.difficulty)
    if (fixture.difficulty !== 'easy') {
      const earlier =
        fixture.difficulty === 'expert' ? 'hard' : fixture.difficulty === 'hard' ? 'medium' : 'easy'
      const failed = analyzeLogic(
        fixture.board,
        RATING_POLICIES[fixture.rules.kind][earlier],
        500,
        { context: compileRules(fixture.rules), workBudget: createWorkBudget(1000000) },
      )

      expect(failed.status).toBe('stalled')
      expect(failed.steps.length).toBeGreaterThan(0)
      expect(
        result.trace.some((step) => TECHNIQUE_TIERS[step.technique] === fixture.difficulty),
      ).toBe(true)
    }
    expect(JSON.stringify(fixture)).toBe(original)
  },
  20000,
)

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

it('finishes the authored Killer Hard trace without repeating lower-policy work', () => {
  const fixture = RATING_FIXTURES.find((item) => item.id === 'killer-hard')
  if (!fixture) {
    throw new Error('Missing known Killer Hard fixture')
  }
  const input = createAssessmentInput(fixture.board, fixture.rules)
  const budget = createWorkBudget(15000)

  const result = rated(assessPuzzleWithBudget(input, budget))

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

it('counts explicit eliminations without placement propagation and rejects no-op actions', () => {
  const evidence = {
    kind: 'unit',
    unit: { kind: 'row', index: 0 },
    cells: [0, 1],
    digits: [1, 2],
    premises: [],
  } as const
  const step: LogicalStep = {
    kind: 'elimination',
    technique: 'naked-pair',
    evidence,
    removals: [
      { cell: 2, digit: 1 },
      { cell: 2, digit: 2 },
    ],
  }

  expect(
    summarizeLogicalTrace(emptyBoard, compileRules({ kind: 'classic' }), [step]),
  ).toMatchObject({
    valid: true,
    value: { steps: 1, eliminations: 1, placements: 0, candidateRemovals: 2 },
  })
  expect(
    summarizeLogicalTrace(emptyBoard, compileRules({ kind: 'classic' }), [step, step]).valid,
  ).toBe(false)
  expect(
    summarizeLogicalTrace(emptyBoard, compileRules({ kind: 'classic' }), [
      { ...step, removals: [step.removals[0], step.removals[0]] },
    ]).valid,
  ).toBe(false)
  expect(
    summarizeLogicalTrace(solvedBoard, compileRules({ kind: 'classic' }), [
      { kind: 'placement', technique: 'naked-single', evidence, cell: 0, digit: 5 },
    ]).valid,
  ).toBe(false)
})

it('counts direct rule evidence and inherited variant premises once per deduction', () => {
  const clue = {
    kind: 'thermo',
    constraintId: 'thermo:0',
    cells: [0, 1],
    digits: [1],
    path: [0, 1],
    bounds: [{ cell: 0, min: 1, max: 8 }],
  } as const
  const steps: readonly LogicalStep[] = [
    {
      kind: 'elimination',
      technique: 'thermo-bound',
      evidence: clue,
      removals: [{ cell: 0, digit: 9 }],
    },
    {
      kind: 'elimination',
      technique: 'locked-candidate',
      evidence: {
        kind: 'unit',
        unit: { kind: 'row', index: 0 },
        cells: [0],
        digits: [1],
        premises: [clue, clue],
      },
      removals: [{ cell: 1, digit: 1 }],
    },
  ]

  expect(
    summarizeLogicalTrace(emptyBoard, compileRules({ kind: 'thermo', paths: [[0, 1]] }), steps),
  ).toMatchObject({ valid: true, value: { variantSteps: 2, candidateRemovals: 2 } })
  for (const variant of ['diagonal', 'jigsaw'] as const) {
    const fixture = VARIANT_FIXTURES[variant]
    const result = rated(assessPuzzle(createAssessmentInput(fixture.givens, fixture.rules)))

    expect(result.summary.workload.variantSteps).toBeGreaterThan(0)
  }
})

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

it.each([
  { board: [0] },
  { rules: { kind: 'unknown' } },
  { ratingVersion: 'unknown' },
  { limits: { maxSteps: -1, maxWork: 1 } },
  { limits: { maxSteps: 500.5, maxWork: 1 } },
  { limits: { maxSteps: 501, maxWork: 1 } },
  { limits: { maxSteps: 500, maxWork: Infinity } },
])('rejects malformed assessment input %j', (change) => {
  expect(
    parseAssessmentInput({ ...createAssessmentInput(uniqueBoard, { kind: 'classic' }), ...change })
      .valid,
  ).toBe(false)
})

function oneHoleSummary() {
  const board: Board = solvedBoard.map((digit, cell) => (cell === 40 ? 0 : digit))

  return rated(assessPuzzle(createAssessmentInput(board, { kind: 'classic' }))).summary
}

it('round-trips a valid versioned summary and every compact outcome', () => {
  const summary = oneHoleSummary()

  expect(parseAssessmentSummary(summary)).toEqual({ valid: true, value: summary })
  for (const outcome of [
    { status: 'rated', summary },
    { status: 'ungraded', ratingVersion: 'sudoku-rating-v2', variant: 'classic' },
    {
      status: 'budget-exhausted',
      ratingVersion: 'sudoku-rating-v2',
      variant: 'classic',
      stage: 'validation',
      difficulty: null,
    },
    {
      status: 'budget-exhausted',
      ratingVersion: 'sudoku-rating-v2',
      variant: 'classic',
      stage: 'logic',
      difficulty: 'medium',
    },
    { status: 'invalid', issues: ['Known conflicting givens'] },
  ]) {
    expect(parseAssessmentOutcome(outcome)).toEqual({ valid: true, value: outcome })
  }
  expect(parseAssessmentOutcome({ status: 'invalid', issues: [] }).valid).toBe(false)
  expect(
    parseAssessmentOutcome({
      status: 'budget-exhausted',
      ratingVersion: 'sudoku-rating-v2',
      variant: 'classic',
      stage: 'logic',
      difficulty: null,
    }).valid,
  ).toBe(false)
})

it.each([
  { steps: -1 },
  { placements: 0.5 },
  { steps: Number.MAX_SAFE_INTEGER + 1 },
  { steps: 2 },
  { eliminations: 1 },
  { candidateRemovals: 1 },
  { variantSteps: 2 },
  { highestTier: 'hard' },
  { highestTechnique: 'hidden-pair' },
  { highestTechnique: null },
])('rejects contradictory workload fields %j', (change) => {
  const summary = oneHoleSummary()

  expect(
    parseAssessmentSummary({ ...summary, workload: { ...summary.workload, ...change } }).valid,
  ).toBe(false)
})

it('rejects missing, unknown and inapplicable technique counts', () => {
  const summary = oneHoleSummary()
  const { 'hidden-pair': omitted, ...missingCounts } = summary.workload.techniqueCounts

  expect(omitted).toBe(0)
  for (const counts of [
    missingCounts,
    { ...summary.workload.techniqueCounts, unknown: 0 },
    { ...summary.workload.techniqueCounts, 'cage-distinct': 1 },
    { ...summary.workload.techniqueCounts, 'naked-single': -1 },
  ]) {
    expect(
      parseAssessmentSummary({
        ...summary,
        workload: { ...summary.workload, techniqueCounts: counts },
      }).valid,
    ).toBe(false)
  }
})

it.each([
  {
    variant: 'classic',
    technique: 'naked-single',
    placements: 0,
    eliminations: 1,
    variantSteps: 0,
  },
  {
    variant: 'classic',
    technique: 'hidden-single',
    placements: 0,
    eliminations: 1,
    variantSteps: 0,
  },
  {
    variant: 'classic',
    technique: 'locked-candidate',
    placements: 1,
    eliminations: 0,
    variantSteps: 0,
  },
  { variant: 'classic', technique: 'naked-pair', placements: 1, eliminations: 0, variantSteps: 0 },
  { variant: 'classic', technique: 'hidden-pair', placements: 1, eliminations: 0, variantSteps: 0 },
  {
    variant: 'killer',
    technique: 'cage-remainder',
    placements: 0,
    eliminations: 1,
    variantSteps: 1,
  },
  {
    variant: 'arrow',
    technique: 'arrow-equation',
    placements: 0,
    eliminations: 1,
    variantSteps: 1,
  },
  {
    variant: 'classic',
    technique: 'naked-single',
    placements: 1,
    eliminations: 0,
    variantSteps: 1,
  },
  {
    variant: 'killer',
    technique: 'cage-distinct',
    placements: 0,
    eliminations: 1,
    variantSteps: 0,
  },
  {
    variant: 'killer',
    technique: 'cage-combination',
    placements: 0,
    eliminations: 1,
    variantSteps: 0,
  },
  { variant: 'thermo', technique: 'thermo-bound', placements: 0, eliminations: 1, variantSteps: 0 },
  {
    variant: 'arrow',
    technique: 'arrow-combination',
    placements: 0,
    eliminations: 1,
    variantSteps: 0,
  },
] as const)('rejects impossible $variant $technique action or evidence counts', (change) => {
  const baseline = oneHoleSummary()
  const counts = Object.fromEntries(
    Object.keys(baseline.workload.techniqueCounts).map((technique) => [technique, 0]),
  )
  const difficulty = TECHNIQUE_TIERS[change.technique]
  const summary = {
    ...baseline,
    variant: change.variant,
    difficulty,
    workload: {
      ...baseline.workload,
      placements: change.placements,
      eliminations: change.eliminations,
      candidateRemovals: change.eliminations,
      variantSteps: change.variantSteps,
      highestTechnique: change.technique,
      highestTier: difficulty,
      techniqueCounts: { ...counts, [change.technique]: 1 },
    },
  }

  expect(parseAssessmentSummary(summary).valid).toBe(false)
  expect(parseAssessmentOutcome({ status: 'rated', summary }).valid).toBe(false)
  expect(
    decodePuzzleAssessment({ status: 'rated', summary }, { variant: change.variant, difficulty }),
  ).toMatchObject({ status: 'unavailable', reason: 'invalid-summary' })
})

it.each([
  { steps: 82, placements: 82, eliminations: 0, candidateRemovals: 0, technique: 'naked-single' },
  { steps: 501, placements: 0, eliminations: 501, candidateRemovals: 501, technique: 'naked-pair' },
  { steps: 1, placements: 0, eliminations: 1, candidateRemovals: 730, technique: 'naked-pair' },
] as const)('rejects workload counts beyond finite board or assessment bounds %j', (change) => {
  const baseline = oneHoleSummary()
  const difficulty = TECHNIQUE_TIERS[change.technique]
  const counts = Object.fromEntries(
    Object.keys(baseline.workload.techniqueCounts).map((technique) => [technique, 0]),
  )
  const summary = {
    ...baseline,
    difficulty,
    workload: {
      ...baseline.workload,
      steps: change.steps,
      placements: change.placements,
      eliminations: change.eliminations,
      candidateRemovals: change.candidateRemovals,
      highestTechnique: change.technique,
      highestTier: difficulty,
      techniqueCounts: { ...counts, [change.technique]: change.steps },
    },
  }

  expect(parseAssessmentSummary(summary).valid).toBe(false)
})

it('retains absence and reports unsupported versions, corrupt summaries and identity disagreement', () => {
  const summary = oneHoleSummary()
  const identity = { variant: 'classic', difficulty: 'easy' } as const
  const sidecar = { status: 'rated', summary } as const

  expect(decodePuzzleAssessment(undefined, identity)).toBeUndefined()
  expect(decodePuzzleAssessment(sidecar, identity)).toEqual(sidecar)
  expect(decodePuzzleAssessment(null, identity)).toMatchObject({
    status: 'unavailable',
    reason: 'invalid-summary',
  })
  expect(
    decodePuzzleAssessment(
      { status: 'rated', summary: { ...summary, ratingVersion: 'sudoku-rating-v1' } },
      identity,
    ),
  ).toMatchObject({ status: 'unavailable', reason: 'unsupported-version' })
  expect(decodePuzzleAssessment(sidecar, { ...identity, difficulty: 'medium' })).toMatchObject({
    status: 'unavailable',
    reason: 'identity-mismatch',
  })
  expect(decodePuzzleAssessment(sidecar, { variant: 'arrow', difficulty: 'easy' })).toMatchObject({
    status: 'unavailable',
    reason: 'identity-mismatch',
  })
  const unavailable = toPuzzleAssessment(
    { status: 'ungraded', ratingVersion: 'sudoku-rating-v2', variant: 'classic' },
    identity,
  )

  expect(unavailable).toMatchObject({ status: 'unavailable', reason: 'ungraded' })
  expect(decodePuzzleAssessment(unavailable, identity)).toEqual(unavailable)
  expect(
    decodePuzzleAssessment({ status: 'unavailable', reason: 'unknown', issues: [] }, identity),
  ).toMatchObject({ reason: 'invalid-summary' })
})
