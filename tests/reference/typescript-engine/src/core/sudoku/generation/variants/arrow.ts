import type { VariantGenerationStrategy } from '@/core/sudoku/generation/types'
import { consumeWork } from '@/core/sudoku/budget'
import { cellsTouch } from '@/core/sudoku/rules/topology'
import { shuffle } from '@/core/sudoku/random'

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
