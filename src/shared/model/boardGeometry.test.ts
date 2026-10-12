import { expect, it } from 'vitest'
import {
  getBoardGeometry,
  getCellRuleContext,
  getSelectedRuleDescriptions,
} from '@/shared/model/boardGeometry'
import { ARROW_REPEAT_RULES, VARIANT_FIXTURES } from '../../../tests/fixtures/variants'
import { transformVariantTemplate } from '@/core/sudoku/variantGeneration'
import type { SpatialSymmetry } from '@/core/sudoku/variantGeneration'
import { VARIANT_TEMPLATES } from '@/core/sudoku/variantTemplates'
it('draws actual Jigsaw region boundaries without a false box divider', () => {
  const geometry = getBoardGeometry(VARIANT_FIXTURES.jigsaw.rules)
  expect(geometry.boundaries).not.toContainEqual({ cell: 2, edge: 'right' })
  expect(geometry.boundaries).toContainEqual({ cell: 1, edge: 'right' })
  expect(geometry.clues).toEqual([])
})
it('keeps one stable label per cage and preserves directed Thermo and Arrow clues', () => {
  const killer = getBoardGeometry(VARIANT_FIXTURES.killer.rules)
  expect(killer.clues).toHaveLength(27)
  expect(killer.clues[0]).toMatchObject({ kind: 'cage', anchor: 0, sum: 6 })
  expect(getBoardGeometry(VARIANT_FIXTURES.thermo.rules).clues[0]).toMatchObject({
    kind: 'thermo',
    cells: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  })
  expect(getBoardGeometry(ARROW_REPEAT_RULES).clues[0]).toMatchObject({
    kind: 'arrow',
    circle: 8,
    shaft: [16, 24, 32, 40],
  })
})
it('explains shared Arrow and Thermo constraints as text', () => {
  expect(getCellRuleContext(8, ARROW_REPEAT_RULES)).toContain('箭头')
  expect(getSelectedRuleDescriptions(16, ARROW_REPEAT_RULES).join(' ')).toContain('总和')
  expect(
    getSelectedRuleDescriptions(1, {
      kind: 'thermo',
      paths: [
        [0, 1],
        [1, 2],
      ],
    }),
  ).toHaveLength(2)
})
it.each([0, 1, 2, 3, 4, 5, 6, 7] as const)(
  'follows transformed geometry under spatial symmetry %s',
  (symmetry: SpatialSymmetry) => {
    for (const variant of ['jigsaw', 'killer', 'thermo', 'arrow'] as const) {
      const transformed = transformVariantTemplate(VARIANT_TEMPLATES[variant].easy[0], { symmetry })
      const geometry = getBoardGeometry(transformed.rules)
      if (transformed.rules.kind === 'jigsaw') {
        for (let cell = 0; cell < 81; cell++) {
          const region = transformed.rules.regions.find((cells) => cells.includes(cell))
          if (!region) throw new Error('Missing fixture region')
          if (cell % 9 < 8)
            expect(
              geometry.boundaries.some((edge) => edge.cell === cell && edge.edge === 'right'),
            ).toBe(!region.includes(cell + 1))
        }
      } else expect(geometry.clues).not.toHaveLength(0)
    }
  },
)
