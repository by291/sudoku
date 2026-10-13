import { expect, it } from 'vitest'
import { RATING_POLICIES } from '@/core/sudoku/ratingPolicies'
import { findVariantStep } from '@/core/sudoku/variantTechniques'
import { assessPuzzleWithBudget, createAssessmentInput } from '@/core/sudoku/rating'
import { createLogicalWorkspace, findLogicalStep } from '@/core/sudoku/logic'
import { analyzeHint } from '@/core/sudoku/hint'
import { explainStep } from '@/core/sudoku/techniques'
import { compileRules } from '@/core/sudoku/rules'
import { createWorkBudget } from '@/core/sudoku/budget'
import {
  ARROW_REPEAT_BOARD,
  ARROW_REPEAT_RULES,
  FULL_LENGTH_THERMO_RULES,
  VARIANT_FIXTURES,
} from '../../../tests/fixtures/variants'
import type { Board } from '@/core/sudoku/types'

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
