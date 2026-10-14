import { expect, it } from 'vitest'
import { transformVariantTemplate, variantRulesMatter } from '@/core/sudoku/variantGeneration'
import { VARIANT_FIXTURES } from '../../../tests/fixtures/variants'
import { createWorkBudget } from '@/core/sudoku/budget'
import { compileRules } from '@/core/sudoku/rules'
import { isComplete } from '@/core/sudoku/board'
import { VARIANT_GENERATION_STRATEGIES } from '@/core/sudoku/generationStrategies'
import { seededRandom } from '@/core/sudoku/random'
import { solvedBoard } from '../../../tests/fixtures/sudoku'
import { structureIssues } from '../../../tests/support/variantStructure'

it.each(Array.from({ length: 8 }, (_, index) => `crowded-cage-${index}`))(
  'avoids trapped singleton cages while preserving complete geometry for %s',
  (seed) => {
    const strategy = VARIANT_GENERATION_STRATEGIES.killer
    const rules = { kind: 'killer' as const, cages: [] }
    const budget = createWorkBudget(10000)

    const geometry = strategy.createGeometry(rules, solvedBoard, seededRandom(seed), budget)

    expect(geometry).not.toBeNull()
    if (!geometry) {
      throw new Error('Missing complete cage geometry')
    }
    expect(structureIssues(solvedBoard, geometry)).toEqual([])
    expect(geometry.cages.filter((cage) => cage.cells.length === 1).length).toBeLessThanOrEqual(1)
    expect(
      strategy.createGeometry(rules, solvedBoard, seededRandom(seed), createWorkBudget(10000)),
    ).toEqual(geometry)
    expect(budget.used).toBeLessThanOrEqual(budget.limit)
    expect(rules.cages).toEqual([])
  },
)

it('discards incomplete cage geometry after exhausting a shared allowance', () => {
  const budget = createWorkBudget(20)
  budget.used = 10

  const geometry = VARIANT_GENERATION_STRATEGIES.killer.createGeometry(
    { kind: 'killer', cages: [] },
    solvedBoard,
    seededRandom('crowded-cage-0'),
    budget,
  )

  expect(geometry).toBeNull()
  expect(budget.used).toBeLessThanOrEqual(budget.limit)
})

it('advertises only rule-preserving digit transformations', () => {
  for (const [kind, strategy] of Object.entries(VARIANT_GENERATION_STRATEGIES)) {
    expect(strategy.allowsDigitMap).toBe(kind === 'diagonal' || kind === 'jigsaw')
    expect(strategy.allowsComplement).toBe(kind !== 'arrow')
  }
})
it.each([0, 1, 2, 3, 4, 5, 6, 7] as const)(
  'preserves complete rules under spatial symmetry %i',
  (symmetry) => {
    for (const fixture of Object.values(VARIANT_FIXTURES)) {
      const transformed = transformVariantTemplate({ ...fixture, difficulty: 'easy' }, { symmetry })

      expect(isComplete(transformed.solution, compileRules(transformed.rules))).toBe(true)
      expect(
        transformed.givens.every(
          (digit, cell) => digit === 0 || digit === transformed.solution[cell],
        ),
      ).toBe(true)
    }
  },
)
it('complements cage totals and reverses increasing Thermo paths', () => {
  const killer = transformVariantTemplate(
    { ...VARIANT_FIXTURES.killer, difficulty: 'easy' },
    { symmetry: 0, complement: true },
  )

  expect(killer.rules.kind).toBe('killer')
  if (killer.rules.kind === 'killer') {
    expect(killer.rules.cages[0].sum).toBe(24)
  }

  const thermo = transformVariantTemplate(
    { ...VARIANT_FIXTURES.thermo, difficulty: 'easy' },
    { symmetry: 0, complement: true },
  )

  expect(thermo.rules).toEqual({ kind: 'thermo', paths: [[8, 7, 6, 5, 4, 3, 2, 1, 0]] })
  expect(isComplete(thermo.solution, compileRules(thermo.rules))).toBe(true)
})
it('rejects transformations that break arrow sums or cage arithmetic', () => {
  expect(() =>
    transformVariantTemplate(
      { ...VARIANT_FIXTURES.arrow, difficulty: 'easy' },
      { symmetry: 0, complement: true },
    ),
  ).toThrow()
  expect(() =>
    transformVariantTemplate(
      { ...VARIANT_FIXTURES.killer, difficulty: 'easy' },
      { symmetry: 0, digitMap: [2, 1, 3, 4, 5, 6, 7, 8, 9] },
    ),
  ).toThrow()
})
it('rejects decorative variant clues and returns inconclusive when verification exhausts', () => {
  const template = { ...VARIANT_FIXTURES.thermo, difficulty: 'easy' } as const

  expect(variantRulesMatter(template, createWorkBudget(1000000))).toEqual({
    status: 'complete',
    matters: false,
  })
  expect(variantRulesMatter(template, createWorkBudget(0))).toEqual({ status: 'budget-exhausted' })
})
