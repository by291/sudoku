import { isRecord, UNIT_SIZE } from '@/core/sudoku/types'
import type { VariantRuleDefinition, Arrow, RuleConstraint } from '@/core/sudoku/rules/types'
import {
  CLASSIC_UNITS,
  invalidRules,
  parseCells,
  isOrderedPath,
  isCellIndex,
} from '@/core/sudoku/rules/topology'

export const ARROW_RULE_DEFINITION: VariantRuleDefinition<'arrow'> = {
  parse(value) {
    if (!isRecord(value) || value.kind !== 'arrow') {
      return invalidRules('Unknown Sudoku rule type')
    }

    if (!Array.isArray(value.arrows) || !value.arrows.length) {
      return invalidRules('Arrow requires clues')
    }

    const arrows: Arrow[] = []

    for (const raw of value.arrows) {
      const arrow: unknown = raw
      if (!isRecord(arrow) || !isCellIndex(arrow.circle)) {
        return invalidRules('Invalid arrow circle')
      }

      const shaft = parseCells(arrow.shaft, 1, UNIT_SIZE)
      if (!shaft || shaft.includes(arrow.circle) || !isOrderedPath([arrow.circle, ...shaft])) {
        return invalidRules('Arrow requires adjacent, distinct shaft cells outside its circle')
      }

      arrows.push({ circle: arrow.circle, shaft })
    }

    return { valid: true, value: { kind: 'arrow', arrows } }
  },

  compile(rules) {
    // Arrow shafts may repeat digits outside shared Sudoku units; relation is not duplication.
    return {
      units: CLASSIC_UNITS,
      constraints: rules.arrows.map((arrow, index): RuleConstraint => ({
        ...arrow,
        kind: 'arrow',
        index,
        id: `arrow:${index}`,
      })),
      duplicateGroups: CLASSIC_UNITS.map((unit) => unit.cells),
    }
  },
}
