import type { VariantGenerationStrategy } from '@/core/sudoku/generation/types'
import { consumeWork } from '@/core/sudoku/budget'
import { cellsTouch } from '@/core/sudoku/ruleTopology'
import { isRecord, UNIT_SIZE } from '@/core/sudoku/types'
import type { VariantRuleDefinition, RuleConstraint } from '@/core/sudoku/ruleTypes'
import { CLASSIC_UNITS, invalidRules, parseCells, isOrderedPath } from '@/core/sudoku/ruleTopology'

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

const CELL_INDICES = Array.from({ length: 81 }, (_, cell) => cell)

export const THERMO_GENERATION_STRATEGY: VariantGenerationStrategy<'thermo'> = {
  allowsDigitMap: false,
  allowsComplement: true,

  createGeometry(rules, solution, random, budget) {
    const paths = rules.paths.map((path) => [...path])

    for (let attempt = 0; attempt < 8; attempt++) {
      const path = [Math.floor(random() * 81)]

      while (path.length < 5) {
        if (!consumeWork(budget)) {
          return null
        }

        const end = path[path.length - 1]
        const choices = CELL_INDICES.filter(
          (cell) =>
            !path.includes(cell) && cellsTouch(end, cell, true) && solution[cell] > solution[end],
        )
        if (!choices.length) {
          break
        }

        path.push(choices[Math.floor(random() * choices.length)])
      }

      if (path.length >= 2 && !paths.some((other) => other.join(',') === path.join(','))) {
        paths.push(path)
      }
    }

    return { kind: 'thermo', paths }
  },

  transformRules(rules, cellMap, complement) {
    return {
      kind: 'thermo',
      paths: rules.paths.map((path) =>
        // Complement reverses order, so reverse the directed path to keep it increasing.
        complement ? path.map(cellMap).reverse() : path.map(cellMap),
      ),
    }
  },
}
