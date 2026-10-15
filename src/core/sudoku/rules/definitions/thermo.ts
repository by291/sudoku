import { isRecord, UNIT_SIZE } from '@/core/sudoku/types'
import type { VariantRuleDefinition, RuleConstraint } from '@/core/sudoku/rules/types'
import {
  CLASSIC_UNITS,
  invalidRules,
  parseCells,
  isOrderedPath,
} from '@/core/sudoku/rules/topology'

export const THERMO_RULE_DEFINITION: VariantRuleDefinition<'thermo'> = {
  parse(value) {
    if (!isRecord(value) || value.kind !== 'thermo') {
      return invalidRules('Unknown Sudoku rule type')
    }

    if (!Array.isArray(value.paths) || !value.paths.length) {
      return invalidRules('Thermo requires paths')
    }

    const paths: number[][] = []

    for (const raw of value.paths) {
      const path = parseCells(raw, 2, UNIT_SIZE)
      if (!path || !isOrderedPath(path)) {
        return invalidRules('Thermo requires adjacent, distinct ordered cells')
      }

      paths.push(path)
    }

    return { valid: true, value: { kind: 'thermo', paths } }
  },

  compile(rules) {
    return {
      units: CLASSIC_UNITS,
      constraints: rules.paths.map((cells, index): RuleConstraint => ({
        kind: 'thermo',
        index,
        id: `thermo:${index}`,
        cells,
      })),
      duplicateGroups: CLASSIC_UNITS.map((unit) => unit.cells),
    }
  },
}
