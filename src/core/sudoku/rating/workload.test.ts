import { expect, it } from 'vitest'
import { assessPuzzle } from '@/core/sudoku/rating/assessment'
import { createAssessmentInput } from '@/core/sudoku/rating/input'
import { summarizeLogicalTrace } from '@/core/sudoku/rating/workload'
import type { AssessmentResult } from '@/core/sudoku/rating/types'
import { compileRules } from '@/core/sudoku/rules/context'
import type { LogicalStep } from '@/core/sudoku/logic/types'
import { solvedBoard, emptyBoard } from '../../../../tests/fixtures/sudoku'
import { VARIANT_FIXTURES } from '../../../../tests/fixtures/variants'

function rated(result: AssessmentResult) {
  expect(result.status).toBe('rated')
  if (result.status !== 'rated') {
    throw new Error(`Expected rated result, received ${result.status}`)
  }

  return result
}

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
