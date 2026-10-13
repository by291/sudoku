import type { VariantGenerationStrategy } from '@/core/sudoku/generationStrategies'
import { isRecord } from '@/core/sudoku/types'
import type { VariantRuleDefinition } from '@/core/sudoku/ruleTypes'
import { CLASSIC_UNITS, compileUnits, invalidRules } from '@/core/sudoku/ruleTopology'

export const DIAGONAL_RULE_DEFINITION: VariantRuleDefinition<'diagonal'> = {
  parse(value) {
    if (!isRecord(value) || value.kind !== 'diagonal') {
      return invalidRules('Unknown Sudoku rule type')
    }

    return { valid: true, value: { kind: 'diagonal' } }
  },

  compile() {
    return compileUnits([
      ...CLASSIC_UNITS,
      { kind: 'diagonal', index: 0, cells: Array.from({ length: 9 }, (_, index) => index * 10) },
      {
        kind: 'diagonal',
        index: 1,
        cells: Array.from({ length: 9 }, (_, index) => (index + 1) * 8),
      },
    ])
  },
}

export const DIAGONAL_GENERATION_STRATEGY: VariantGenerationStrategy<'diagonal'> = {
  allowsDigitMap: true,
  allowsComplement: true,

  createGeometry(rules) {
    return rules
  },

  transformRules(rules) {
    return rules
  },
}
