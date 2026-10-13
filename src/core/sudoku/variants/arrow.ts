import type { VariantGenerationStrategy } from '@/core/sudoku/generationStrategies'
import { consumeWork } from '@/core/sudoku/budget'
import { cellsTouch } from '@/core/sudoku/ruleTopology'
import { shuffle } from '@/core/sudoku/random'
import { isRecord, UNIT_SIZE } from '@/core/sudoku/types'
import type { VariantRuleDefinition, Arrow, RuleConstraint } from '@/core/sudoku/ruleTypes'
import {
  CLASSIC_UNITS,
  invalidRules,
  parseCells,
  isOrderedPath,
  isCellIndex,
} from '@/core/sudoku/ruleTopology'

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

const CELL_INDICES = Array.from({ length: 81 }, (_, cell) => cell)

export const ARROW_GENERATION_STRATEGY: VariantGenerationStrategy<'arrow'> = {
  allowsDigitMap: false,
  allowsComplement: false,

  createGeometry(rules, solution, random, budget) {
    const arrows = [...rules.arrows]

    for (let attempt = 0; attempt < 12 && arrows.length < 4; attempt++) {
      const circle = Math.floor(random() * 81)
      if (solution[circle] < 3) {
        continue
      }

      function shaft(path: readonly number[], total: number): readonly number[] | null {
        if (!consumeWork(budget)) {
          return null
        }

        if (total === solution[circle]) {
          return path.length >= 2 ? path : null
        }

        if (path.length >= 5) {
          return null
        }

        const end = path.length ? path[path.length - 1] : circle
        const choices = shuffle(
          CELL_INDICES.filter(
            (cell) =>
              cell !== circle &&
              !path.includes(cell) &&
              cellsTouch(end, cell, true) &&
              total + solution[cell] <= solution[circle],
          ),
          random,
        )

        for (const cell of choices) {
          const result = shaft([...path, cell], total + solution[cell])
          if (result) {
            return result
          }

          if (budget.used >= budget.limit) {
            return null
          }
        }

        return null
      }

      const path = shaft([], 0)
      if (budget.used >= budget.limit) {
        return null
      }

      if (path) {
        arrows.push({ circle, shaft: path })
      }
    }

    return { kind: 'arrow', arrows }
  },

  transformRules(rules, cellMap) {
    return {
      kind: 'arrow',
      arrows: rules.arrows.map((arrow) => ({
        circle: cellMap(arrow.circle),
        shaft: arrow.shaft.map(cellMap),
      })),
    }
  },
}
