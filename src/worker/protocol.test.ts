import { expect, it } from 'vitest'
import { parseWorkerRequest, parseWorkerResponse, validateHintEvidence } from '@/worker/protocol'
import { createGenerationInput } from '@/core/sudoku/generation'
import { analyzeHint } from '@/core/sudoku/hint'
import { createLogicalWorkspace } from '@/core/sudoku/logic'
import { findVariantStep } from '@/core/sudoku/variantTechniques'
import { compileRules } from '@/core/sudoku/rules'
import { createWorkBudget } from '@/core/sudoku/budget'
import type { HintResult } from '@/core/sudoku/hint'
import {
  ARROW_REPEAT_BOARD,
  ARROW_REPEAT_RULES,
  VARIANT_FIXTURES,
} from '../../tests/fixtures/variants'

it.each(Object.entries(VARIANT_FIXTURES))(
  'accepts complete %s rules and validates the supplied solution',
  (_, fixture) => {
    expect(
      parseWorkerRequest({
        kind: 'hint',
        requestId: 'hint',
        board: fixture.givens,
        solution: fixture.solution,
        rules: fixture.rules,
      }).valid,
    ).toBe(true)
    expect(
      parseWorkerRequest({
        kind: 'hint',
        requestId: 'hint',
        board: fixture.givens,
        solution: fixture.solution,
      }).valid,
    ).toBe(false)
    const result = analyzeHint(fixture.givens, fixture.solution, 500, {
      context: compileRules(fixture.rules),
      workBudget: createWorkBudget(1000000),
    })

    expect(
      parseWorkerResponse({
        kind: 'hint',
        requestId: 'hint',
        outcome: { status: 'completed', value: result },
      }),
    ).toMatchObject({ valid: true })
  },
)
it('rejects unknown types, generation versions, geometry, and contradictory solutions', () => {
  const fixture = VARIANT_FIXTURES.thermo

  expect(
    parseWorkerRequest({
      kind: 'generate',
      requestId: 'a',
      input: { ...createGenerationInput('arrow', 'easy', 'test'), puzzleVersion: 'future' },
    }).valid,
  ).toBe(false)

  for (const rules of [
    { kind: 'unknown' },
    { kind: 'thermo', paths: [[0, 2]] },
    { kind: 'thermo', paths: [[1, 0]] },
  ]) {
    expect(
      parseWorkerRequest({
        kind: 'hint',
        requestId: 'hint',
        board: fixture.givens,
        solution: fixture.solution,
        rules,
      }).valid,
    ).toBe(false)
  }
})
it.each(['killer', 'thermo', 'arrow'] as const)(
  'validates typed %s clue evidence against its actual clue',
  (variant) => {
    const fixture = VARIANT_FIXTURES[variant]
    const board =
      variant === 'arrow'
        ? ARROW_REPEAT_BOARD.map((digit, cell) => (cell === 40 ? 0 : digit))
        : variant === 'thermo'
          ? Array(81).fill(0)
          : fixture.givens
    const technique =
      variant === 'killer'
        ? 'cage-remainder'
        : variant === 'thermo'
          ? 'thermo-bound'
          : 'arrow-equation'
    const context = compileRules(fixture.rules)
    const result = findVariantStep(
      createLogicalWorkspace(board, context),
      context,
      [technique],
      createWorkBudget(1000000),
    )
    if (
      result.status !== 'complete' ||
      !result.step ||
      result.step.kind !== 'placement' ||
      result.step.evidence.kind === 'unit'
    ) {
      throw new Error('Expected fixed clue placement')
    }

    const hint: HintResult = {
      kind: 'deduction',
      steps: [result.step],
      placement: { cell: result.step.cell, digit: result.step.digit },
    }
    const parsed = parseWorkerResponse({
      kind: 'hint',
      requestId: 'clue',
      outcome: { status: 'completed', value: hint },
    })

    expect(parsed.valid).toBe(true)
    expect(validateHintEvidence(hint, fixture.rules).valid).toBe(true)
    expect(
      validateHintEvidence(
        {
          ...hint,
          steps: [
            { ...result.step, evidence: { ...result.step.evidence, constraintId: 'missing:999' } },
          ],
        },
        fixture.rules,
      ).valid,
    ).toBe(false)
  },
)
it('rejects malformed evidence masks and out-of-range placements', () => {
  const fixture = VARIANT_FIXTURES.arrow
  const board = ARROW_REPEAT_BOARD.map((digit, cell) => (cell === 40 ? 0 : digit))
  const hint = analyzeHint(board, fixture.solution, 500, {
    context: compileRules(ARROW_REPEAT_RULES),
    workBudget: createWorkBudget(1000000),
  })
  if (hint.kind !== 'deduction') {
    throw new Error('Missing fixed Arrow proof')
  }

  const malformed = { ...hint, placement: { cell: 81, digit: 2 } }

  expect(
    parseWorkerResponse({
      kind: 'hint',
      requestId: 'bad',
      outcome: { status: 'completed', value: malformed },
    }).valid,
  ).toBe(false)
  expect(validateHintEvidence(hint, { kind: 'classic' }).valid).toBe(false)
  if (ARROW_REPEAT_RULES.kind !== 'arrow') {
    throw new Error('Expected Arrow rules')
  }

  const clue = ARROW_REPEAT_RULES.arrows[0]
  const cells = [clue.circle, ...clue.shaft]
  const malformedMask = {
    ...hint,
    steps: [
      {
        kind: 'placement',
        technique: 'arrow-equation',
        cell: 40,
        digit: 2,
        evidence: {
          kind: 'arrow',
          constraintId: 'arrow:0',
          cells,
          digits: [2],
          circle: clue.circle,
          shaft: clue.shaft,
          domains: cells.map((cell) => ({ cell, mask: 0 })),
        },
      },
    ],
  }

  expect(
    parseWorkerResponse({
      kind: 'hint',
      requestId: 'mask',
      outcome: { status: 'completed', value: malformedMask },
    }).valid,
  ).toBe(false)
})
