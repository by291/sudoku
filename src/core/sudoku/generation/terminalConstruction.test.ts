import { expect, it } from 'vitest'
import { constructUnitTerminal } from '@/core/sudoku/generation/terminalConstruction'
import { compileRules, CLASSIC_CONTEXT } from '@/core/sudoku/rules/context'
import { VARIANT_TEMPLATES } from '@/core/sudoku/examples/variants'
import { seededRandom } from '@/core/sudoku/random'
import { createWorkBudget } from '@/core/sudoku/budget'
import { referenceCountSolutions } from '../../../../tests/support/referenceVariants'
import { countIntercalates } from '../../../../tests/support/terminalDiversity'

it.each(['classic', 'diagonal', 'jigsaw'] as const)(
  'constructs non-cosmetic %s terminal families within the caller budget',
  (variant) => {
    const context =
      variant === 'classic'
        ? CLASSIC_CONTEXT
        : compileRules(VARIANT_TEMPLATES[variant].easy[0].rules)
    const families = new Set<number>()

    for (let seed = 0; seed < 16; seed++) {
      const budget = createWorkBudget(1000000)
      const result = constructUnitTerminal(context, seededRandom(`terminal-corpus-${seed}`), budget)

      expect(result.status).toBe('ready')
      if (result.status !== 'ready') {
        throw new Error(`Incomplete ${variant} terminal`)
      }

      expect(referenceCountSolutions(result.solution, context.rules)).toEqual({
        count: 1,
        solution: result.solution,
      })
      expect(budget.used).toBeGreaterThan(0)
      expect(budget.used).toBeLessThanOrEqual(budget.limit)
      families.add(countIntercalates(result.solution))
    }

    expect(families.size).toBeGreaterThanOrEqual(4)
  },
  30000,
)

it('does not reset an existing allowance or reveal an incomplete grid', () => {
  const budget = createWorkBudget(5)
  budget.used = 4

  expect(constructUnitTerminal(CLASSIC_CONTEXT, seededRandom('bounded'), budget)).toEqual({
    status: 'budget-exhausted',
  })
  expect(budget.used).toBe(5)
})

it('abandons a regional terminal attempt without consuming the remaining aggregate allowance', () => {
  const context = compileRules(VARIANT_TEMPLATES.jigsaw.easy[0].rules)
  const budget = createWorkBudget(1000000)
  budget.used = 100

  const result = constructUnitTerminal(context, seededRandom('local-cap'), budget, 1)

  expect(result).toEqual({ status: 'attempt-exhausted' })
  expect(budget.used).toBeGreaterThan(100)
  expect(budget.used).toBeLessThan(120)
  expect(constructUnitTerminal(context, seededRandom('local-cap-retry'), budget).status).toBe(
    'ready',
  )
})

it('rejects partial units and arithmetic constraints as terminal construction inputs', () => {
  const incomplete = {
    ...CLASSIC_CONTEXT,
    units: CLASSIC_CONTEXT.units.map((unit, index) =>
      index === 0 ? { ...unit, cells: unit.cells.slice(1) } : unit,
    ),
  }

  expect(
    constructUnitTerminal(incomplete, seededRandom('partial'), createWorkBudget(1000)).status,
  ).toBe('failed')
  const killer = compileRules(VARIANT_TEMPLATES.killer.easy[0].rules)

  expect(
    constructUnitTerminal(killer, seededRandom('arithmetic'), createWorkBudget(1000)).status,
  ).toBe('failed')
})
