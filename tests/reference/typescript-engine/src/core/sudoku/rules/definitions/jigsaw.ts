import type { RulesFor, VariantRuleDefinition, SudokuUnit } from '@/core/sudoku/rules/types'
import { isRecord, UNIT_SIZE } from '@/core/sudoku/types'
import {
  CLASSIC_UNITS,
  compileUnits,
  invalidRules,
  parseCells,
  isConnected,
  isPartition,
} from '@/core/sudoku/rules/topology'

export const JIGSAW_RULE_DEFINITION: VariantRuleDefinition<'jigsaw'> = {
  parse(value) {
    if (!isRecord(value) || value.kind !== 'jigsaw') {
      return invalidRules('Unknown Sudoku rule type')
    }

    if (!Array.isArray(value.regions) || value.regions.length !== UNIT_SIZE) {
      return invalidRules('Jigsaw requires nine regions')
    }

    const regions: number[][] = []

    for (const raw of value.regions) {
      const region = parseCells(raw, UNIT_SIZE, UNIT_SIZE)
      if (!region || !isConnected(region)) {
        return invalidRules('Jigsaw regions must contain nine connected cells')
      }

      regions.push(region)
    }

    if (!isPartition(regions)) {
      return invalidRules('Jigsaw regions must partition all cells')
    }

    return { valid: true, value: { kind: 'jigsaw', regions } }
  },

  compile(rules) {
    return compileUnits([
      ...CLASSIC_UNITS.slice(0, UNIT_SIZE * 2),
      ...rules.regions.map((cells, index): SudokuUnit => ({ kind: 'region', index, cells })),
    ])
  },
}

export function irregularRegions(rules: RulesFor<'jigsaw'>): boolean {
  return rules.regions.some((region) => {
    const rows = region.map((cell) => Math.floor(cell / 9))
    const columns = region.map((cell) => cell % 9)

    return (
      (Math.max(...rows) - Math.min(...rows) + 1) *
        (Math.max(...columns) - Math.min(...columns) + 1) !==
      region.length
    )
  })
}
