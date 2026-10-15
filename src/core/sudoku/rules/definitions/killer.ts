import { isRecord, UNIT_SIZE } from '@/core/sudoku/types'
import type { VariantRuleDefinition, Cage, RuleConstraint } from '@/core/sudoku/rules/types'
import {
  CLASSIC_UNITS,
  invalidRules,
  parseCells,
  isConnected,
  isPartition,
} from '@/core/sudoku/rules/topology'

export const KILLER_RULE_DEFINITION: VariantRuleDefinition<'killer'> = {
  parse(value) {
    if (!isRecord(value) || value.kind !== 'killer') {
      return invalidRules('Unknown Sudoku rule type')
    }

    if (!Array.isArray(value.cages) || !value.cages.length) {
      return invalidRules('Killer requires cages')
    }

    const cages: Cage[] = []

    for (const raw of value.cages) {
      const cage: unknown = raw
      if (!isRecord(cage) || typeof cage.sum !== 'number' || !Number.isInteger(cage.sum)) {
        return invalidRules('Invalid cage total')
      }

      const region = parseCells(cage.cells, 1, UNIT_SIZE)
      if (!region || !isConnected(region)) {
        return invalidRules('Cages must contain connected distinct cells')
      }

      const count = region.length
      if (cage.sum < (count * (count + 1)) / 2 || cage.sum > (count * (19 - count)) / 2) {
        return invalidRules('Cage total is outside distinct digit bounds')
      }

      cages.push({ cells: region, sum: cage.sum })
    }

    if (!isPartition(cages.map((cage) => cage.cells))) {
      return invalidRules('Cages must partition all cells')
    }

    return { valid: true, value: { kind: 'killer', cages } }
  },

  compile(rules) {
    const constraints = rules.cages.map((cage, index): RuleConstraint => ({
      ...cage,
      kind: 'cage',
      index,
      id: `cage:${index}`,
    }))

    // Cages forbid repeated digits but are not full nine-digit units.
    return {
      units: CLASSIC_UNITS,
      constraints,
      duplicateGroups: [
        ...CLASSIC_UNITS.map((unit) => unit.cells),
        ...rules.cages.map((cage) => cage.cells),
      ],
    }
  },
}
