import { isRecord } from '@/core/sudoku/types'
import type { VariantRuleDefinition } from '@/core/sudoku/rules/types'
import { CLASSIC_UNITS, compileUnits, invalidRules } from '@/core/sudoku/rules/topology'

export const CLASSIC_RULE_DEFINITION: VariantRuleDefinition<'classic'> = {
  parse(value) {
    if (!isRecord(value) || value.kind !== 'classic') {
      return invalidRules('Unknown Sudoku rule type')
    }

    return { valid: true, value: { kind: 'classic' } }
  },

  compile() {
    return compileUnits(CLASSIC_UNITS)
  },
}
