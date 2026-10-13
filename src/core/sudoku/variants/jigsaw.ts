import type { VariantGenerationStrategy } from '@/core/sudoku/generationStrategies'
import type { RulesFor } from '@/core/sudoku/ruleTypes'
import { consumeWork } from '@/core/sudoku/budget'
import { isRecord, UNIT_SIZE } from '@/core/sudoku/types'
import type { VariantRuleDefinition, SudokuUnit } from '@/core/sudoku/ruleTypes'
import {
  CLASSIC_UNITS,
  compileUnits,
  invalidRules,
  parseCells,
  isConnected,
  isPartition,
} from '@/core/sudoku/ruleTopology'

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

export const JIGSAW_GENERATION_STRATEGY: VariantGenerationStrategy<'jigsaw'> = {
  allowsDigitMap: true,
  allowsComplement: true,

  createGeometry(rules, solution, random, budget) {
    let regions = rules.regions.map((region) => [...region])

    for (let attempt = 0; attempt < 20; attempt++) {
      if (!consumeWork(budget)) {
        return null
      }

      const first = Math.floor(random() * 81)
      const second = Math.floor(random() * 81)
      if (first === second || solution[first] !== solution[second]) {
        continue
      }

      const firstRegion = regions.findIndex((region) => region.includes(first))
      const secondRegion = regions.findIndex((region) => region.includes(second))
      if (firstRegion === secondRegion) {
        continue
      }

      const candidate = regions.map((region, index) => {
        if (index === firstRegion) {
          return region.map((cell) => (cell === first ? second : cell))
        }

        if (index === secondRegion) {
          return region.map((cell) => (cell === second ? first : cell))
        }

        return [...region]
      })
      const proposed: RulesFor<'jigsaw'> = { kind: 'jigsaw', regions: candidate }
      if (JIGSAW_RULE_DEFINITION.parse(proposed).valid && irregularRegions(proposed)) {
        regions = candidate
      }
    }

    return { kind: 'jigsaw', regions }
  },

  transformRules(rules, cellMap) {
    return { kind: 'jigsaw', regions: rules.regions.map((region) => region.map(cellMap)) }
  },
}
