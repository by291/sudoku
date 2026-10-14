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
const CELL_NEIGHBOURS = CELL_INDICES.map((cell) =>
  CELL_INDICES.filter((other) => cellsTouch(cell, other, false)),
)
const MIN_GENERATED_CAGE_SIZE = 2
const MAX_GENERATED_CAGE_SIZE = 4

function unusedNeighbourCount(cell: number, remaining: ReadonlySet<number>): number {
  return CELL_NEIGHBOURS[cell].filter((other) => remaining.has(other)).length
}

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

      let first: number | undefined
      let fewestOpenSides = Infinity
      // Grow out of narrow corners first. Random starting cells can seal off several
      // neighbours, forcing singleton cages which disclose digits and simplify the puzzle.
      for (const cell of remaining) {
        if (!consumeWork(budget)) {
          return null
        }
        const openSides = unusedNeighbourCount(cell, remaining)
        if (openSides < fewestOpenSides) {
          first = cell
          fewestOpenSides = openSides
        }
      }
      if (first === undefined) {
        throw new Error('Missing unused cage cell')
      }

      const cells = [first]
      remaining.delete(first)
      const size =
        MIN_GENERATED_CAGE_SIZE +
        Math.floor(random() * (MAX_GENERATED_CAGE_SIZE - MIN_GENERATED_CAGE_SIZE + 1))

      while (cells.length < size) {
        const choices: number[] = []
        const crowded: number[] = []
        for (const cell of remaining) {
          if (!consumeWork(budget)) {
            return null
          }
          if (
            !cells.some((other) => CELL_NEIGHBOURS[other].includes(cell)) ||
            cells.some((other) => solution[other] === solution[cell])
          ) {
            continue
          }
          choices.push(cell)
          if (unusedNeighbourCount(cell, remaining) <= 1) {
            crowded.push(cell)
          }
        }
        if (!choices.length) {
          break
        }

        // Absorb a neighbour about to lose its last free connection before other choices.
        const eligible = crowded.length ? crowded : choices
        const next = eligible[Math.floor(random() * eligible.length)]
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
