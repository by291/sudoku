import type { VariantGenerationStrategy } from '@/core/sudoku/generation/types'
import { consumeWork } from '@/core/sudoku/budget'
import { cellsTouch } from '@/core/sudoku/rules/topology'

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
