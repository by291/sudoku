import { expect, it } from 'vitest'
import { assessPuzzle } from '@/core/sudoku/rating/assessment'
import { createAssessmentInput } from '@/core/sudoku/rating/input'
import {
  parseAssessmentSummary,
  parseAssessmentOutcome,
  decodePuzzleAssessment,
  toPuzzleAssessment,
} from '@/core/sudoku/rating/decoding'
import type { AssessmentResult } from '@/core/sudoku/rating/types'
import { RATING_POLICIES, TECHNIQUE_TIERS } from '@/core/sudoku/rating/policies'
import { analyzeLogic } from '@/core/sudoku/logic/solver'
import { compileRules } from '@/core/sudoku/rules/context'
import { createWorkBudget } from '@/core/sudoku/budget'
import type { Board } from '@/core/sudoku/types'
import { RATING_FIXTURES } from '../../../../tests/fixtures/rating'
import { solvedBoard } from '../../../../tests/fixtures/sudoku'
import { referenceCountSolutions } from '../../../../tests/support/referenceVariants'

function oneHoleSummary() {
  const board: Board = solvedBoard.map((digit, cell) => (cell === 40 ? 0 : digit))

  return rated(assessPuzzle(createAssessmentInput(board, { kind: 'classic' }))).summary
}

function rated(result: AssessmentResult) {
  expect(result.status).toBe('rated')
  if (result.status !== 'rated') {
    throw new Error(`Expected rated result, received ${result.status}`)
  }

  return result
}

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
