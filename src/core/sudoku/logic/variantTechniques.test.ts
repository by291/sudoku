import { expect, it } from 'vitest'
import { RATING_POLICIES } from '@/core/sudoku/rating/policies'
import { findVariantStep } from '@/core/sudoku/logic/variantTechniques'
import { assessPuzzleWithBudget } from '@/core/sudoku/rating/assessment'
import { createAssessmentInput } from '@/core/sudoku/rating/input'
import { createLogicalWorkspace } from '@/core/sudoku/logic/workspace'
import { findLogicalStep } from '@/core/sudoku/logic/solver'
import { analyzeHint } from '@/core/sudoku/hint'
import { explainStep } from '@/features/game/model/techniquePresentation'
import { compileRules } from '@/core/sudoku/rules/context'
import { createWorkBudget } from '@/core/sudoku/budget'
import {
  ARROW_REPEAT_BOARD,
  ARROW_REPEAT_RULES,
  FULL_LENGTH_THERMO_RULES,
  VARIANT_FIXTURES,
} from '../../../../tests/fixtures/variants'
import type { Board } from '@/core/sudoku/types'

function sumThreeWorkspace() {
  const solution = VARIANT_FIXTURES.thermo.solution
  const context = compileRules({
    kind: 'killer',
    cages: [
      { cells: [0, 1], sum: 3 },
      ...Array.from({ length: 79 }, (_, index) => ({
        cells: [index + 2],
        sum: solution[index + 2],
      })),
    ],
  })
  const workspace = createLogicalWorkspace(Array(81).fill(0), context)
  // A distinct sum of three supports exactly {1, 2} in each cell.
  workspace.candidates[0] = 7
  workspace.candidates[1] = 7

  return workspace
}

it('reuses complete cage support with one charged visit when local domains are unchanged', () => {
  const workspace = sumThreeWorkspace()
  const first = findVariantStep(
    workspace,
    workspace.context,
    ['cage-combination'],
    createWorkBudget(100),
  )
  const nextBudget = createWorkBudget(1)

  const next = findVariantStep(workspace, workspace.context, ['cage-combination'], nextBudget)

  expect(first).toMatchObject({
    status: 'complete',
    step: {
      kind: 'elimination',
      removals: [
        { cell: 0, digit: 3 },
        { cell: 1, digit: 3 },
      ],
    },
  })
  expect(next).toEqual(first)
  expect(nextBudget.used).toBe(1)
  expect(
    findVariantStep(workspace, workspace.context, ['cage-combination'], createWorkBudget(0)),
  ).toEqual({ status: 'budget-exhausted' })
})

it('recomputes cage support after candidate elimination or a fixed digit changes its domains', () => {
  const workspace = sumThreeWorkspace()
  findVariantStep(workspace, workspace.context, ['cage-combination'], createWorkBudget(100))
  workspace.candidates[0] = 5
  const changedBudget = createWorkBudget(100)

  const changed = findVariantStep(workspace, workspace.context, ['cage-combination'], changedBudget)

  expect(changed).toMatchObject({
    status: 'complete',
    step: { kind: 'placement', cell: 0, digit: 1 },
  })
  expect(changedBudget.used).toBeGreaterThan(1)

  workspace.board[0] = 2
  const fixedBudget = createWorkBudget(100)
  const fixed = findVariantStep(workspace, workspace.context, ['cage-combination'], fixedBudget)

  expect(fixed).toMatchObject({
    status: 'complete',
    step: { kind: 'placement', cell: 1, digit: 1 },
  })
  expect(fixedBudget.used).toBeGreaterThan(1)
})

it('never reuses incomplete enumeration or another board workspace as a cage proof', () => {
  const workspace = sumThreeWorkspace()

  expect(
    findVariantStep(workspace, workspace.context, ['cage-combination'], createWorkBudget(2)),
  ).toEqual({ status: 'budget-exhausted' })
  expect(
    findVariantStep(workspace, workspace.context, ['cage-combination'], createWorkBudget(1)),
  ).toEqual({ status: 'budget-exhausted' })
  findVariantStep(workspace, workspace.context, ['cage-combination'], createWorkBudget(100))
  const other = createLogicalWorkspace(workspace.board, workspace.context)
  other.candidates[0] = 7
  other.candidates[1] = 7

  expect(findVariantStep(other, other.context, ['cage-combination'], createWorkBudget(1))).toEqual({
    status: 'budget-exhausted',
  })
})

it('keeps cage proofs separate from changed clue geometry, sums and rule contexts', () => {
  const workspace = sumThreeWorkspace()
  // Raw callers may supply mutable contexts; prepared contexts themselves are immutable.
  workspace.context = {
    ...workspace.context,
    constraints: workspace.context.constraints.map((constraint) => ({ ...constraint })),
  }
  const constraint = workspace.context.constraints[0]
  if (constraint.kind !== 'cage') {
    throw new Error('Missing arithmetic fixture')
  }

  findVariantStep(workspace, workspace.context, ['cage-combination'], createWorkBudget(100))
  constraint.sum = 5

  expect(
    findVariantStep(workspace, workspace.context, ['cage-combination'], createWorkBudget(100)),
  ).toMatchObject({
    status: 'complete',
    step: {
      kind: 'elimination',
      removals: [
        { cell: 0, digit: 1 },
        { cell: 1, digit: 1 },
      ],
    },
  })

  constraint.sum = 3
  constraint.cells = [0, 2]
  workspace.candidates[2] = 7

  expect(
    findVariantStep(workspace, workspace.context, ['cage-combination'], createWorkBudget(100)),
  ).toMatchObject({
    status: 'complete',
    step: {
      kind: 'elimination',
      removals: [
        { cell: 0, digit: 3 },
        { cell: 2, digit: 3 },
      ],
    },
  })
  expect(
    findVariantStep(workspace, { ...workspace.context }, ['cage-combination'], createWorkBudget(1)),
  ).toEqual({ status: 'budget-exhausted' })
})

it('owns the cage proof independently of returned deduction evidence', () => {
  const workspace = sumThreeWorkspace()
  const first = findVariantStep(
    workspace,
    workspace.context,
    ['cage-combination'],
    createWorkBudget(100),
  )
  if (first.status !== 'complete' || !first.step) {
    throw new Error('Missing cage proof')
  }

  Object.assign(first.step.evidence.cells, { 0: 80 })
  Object.assign(first.step.evidence.digits, { 0: 9 })

  expect(
    findVariantStep(workspace, workspace.context, ['cage-combination'], createWorkBudget(1)),
  ).toMatchObject({
    status: 'complete',
    step: {
      evidence: { cells: [0, 1], digits: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
      removals: [
        { cell: 0, digit: 3 },
        { cell: 1, digit: 3 },
      ],
    },
  })
})

it('keeps combination deductions outside the easy policy', () => {
  expect(RATING_POLICIES.arrow.easy).not.toContain('arrow-combination')
  expect(RATING_POLICIES.arrow.medium).toContain('arrow-combination')
  expect(RATING_POLICIES.arrow.hard).toContain('hidden-pair')
})

it('solves a one-unknown arrow equation without excluding permitted repeats', () => {
  const board = [...ARROW_REPEAT_BOARD]
  board[40] = 0
  const context = compileRules(ARROW_REPEAT_RULES)
  const step = findVariantStep(
    createLogicalWorkspace(board, context),
    context,
    ['arrow-equation'],
    createWorkBudget(1000000),
  )

  expect(step).toMatchObject({
    status: 'complete',
    step: {
      kind: 'placement',
      cell: 40,
      digit: 2,
      evidence: { kind: 'arrow', constraintId: 'arrow:0' },
    },
  })
  if (step.status !== 'complete' || !step.step) {
    throw new Error('Missing arrow proof')
  }

  expect(explainStep(step.step)).toContain('总和')
})

it('explains the cage premise before its resulting single', () => {
  const solution = VARIANT_FIXTURES.thermo.solution
  const rules = {
    kind: 'killer',
    cages: [
      { cells: [0, 1], sum: 3 },
      ...Array.from({ length: 79 }, (_, index) => ({
        cells: [index + 2],
        sum: solution[index + 2],
      })),
    ],
  } as const
  const board: Board = solution.map((_, cell) => (cell === 0 ? 1 : 0))
  const context = compileRules(rules)
  const result = findVariantStep(
    createLogicalWorkspace(board, context),
    context,
    ['cage-remainder'],
    createWorkBudget(1000000),
  )

  expect(result).toMatchObject({
    status: 'complete',
    step: { kind: 'placement', cell: 1, digit: 2, evidence: { kind: 'cage', sum: 3 } },
  })
  if (result.status === 'complete' && result.step) {
    expect(explainStep(result.step)).toContain('笼')
  }
})

it('explains thermo positional bounds with independently known digits', () => {
  const context = compileRules(FULL_LENGTH_THERMO_RULES)
  const result = analyzeHint(Array(81).fill(0), VARIANT_FIXTURES.thermo.solution, 500, {
    context,
    workBudget: createWorkBudget(1000000),
  })

  expect(result).toMatchObject({ kind: 'deduction', placement: { cell: 0, digit: 1 } })
  if (result.kind === 'deduction') {
    expect(result.steps[0].evidence.kind).toBe('thermo')
    expect(explainStep(result.steps[0])).toContain('递增')
  }
})

it.each(['diagonal', 'jigsaw'] as const)('uses %s units for hidden singles', (variant) => {
  const context = compileRules(VARIANT_FIXTURES[variant].rules)
  const targetUnit = context.units.find(
    (unit) => unit.kind === (variant === 'diagonal' ? 'diagonal' : 'region'),
  )
  if (!targetUnit) {
    throw new Error('Missing variant unit')
  }

  const state = createLogicalWorkspace(Array(81).fill(0), context)

  for (const cell of targetUnit.cells.slice(1)) {
    state.candidates[cell] &= ~1
  }

  expect(findLogicalStep(state, ['hidden-single'])).toMatchObject({
    status: 'complete',
    step: {
      kind: 'placement',
      cell: targetUnit.cells[0],
      digit: 1,
      evidence: { kind: 'unit', unit: { kind: targetUnit.kind } },
    },
  })
})

it('returns an explicit arithmetic budget outcome rather than a claimed difficulty', () => {
  expect(
    assessPuzzleWithBudget(
      createAssessmentInput(ARROW_REPEAT_BOARD, ARROW_REPEAT_RULES),
      createWorkBudget(0),
    ),
  ).toMatchObject({ status: 'budget-exhausted' })
})
