import type { VariantGenerationStrategy } from '@/core/sudoku/generationStrategies'
import { consumeWork } from '@/core/sudoku/budget'
import { cellsTouch } from '@/core/sudoku/ruleTopology'
import { shuffle } from '@/core/sudoku/random'
import { isRecord, UNIT_SIZE } from '@/core/sudoku/types'
import type { VariantRuleDefinition, Cage, RuleConstraint } from '@/core/sudoku/ruleTypes'
import {
  CLASSIC_UNITS,
  invalidRules,
  parseCells,
  isConnected,
  isPartition,
} from '@/core/sudoku/ruleTopology'

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

const CELL_INDICES = Array.from({ length: 81 }, (_, cell) => cell)

export const KILLER_GENERATION_STRATEGY: VariantGenerationStrategy<'killer'> = {
  allowsDigitMap: false,
  allowsComplement: true,

  createGeometry(rules, solution, random, budget) {
    const remaining = new Set(shuffle(CELL_INDICES, random))
    const cages: { cells: number[]; sum: number }[] = []

    while (remaining.size) {
      if (!consumeWork(budget)) {
        return null
      }

      const first = remaining.values().next().value
      if (first === undefined) {
        break
      }

      const cells = [first]
      remaining.delete(first)
      const size = 2 + Math.floor(random() * 3)

      while (cells.length < size) {
        const choices = [...remaining].filter(
          (cell) =>
            cells.some((other) => cellsTouch(cell, other, false)) &&
            !cells.some((other) => solution[other] === solution[cell]),
        )
        if (!choices.length) {
          break
        }

        const next = choices[Math.floor(random() * choices.length)]
        cells.push(next)
        remaining.delete(next)
      }

      cages.push({ cells, sum: cells.reduce((sum, cell) => sum + solution[cell], 0) })
    }

    return { kind: 'killer', cages }
  },

  transformRules(rules, cellMap, complement) {
    return {
      kind: 'killer',
      cages: rules.cages.map((cage) => ({
        cells: cage.cells.map(cellMap),
        // Complementing every digit changes an n-cell total S to 10n - S.
        sum: complement ? cage.cells.length * 10 - cage.sum : cage.sum,
      })),
    }
  },
}
