import type { VariantGenerationStrategy } from '@/core/sudoku/generation/types'
import { consumeWork } from '@/core/sudoku/budget'
import { cellsTouch } from '@/core/sudoku/rules/topology'
import { shuffle } from '@/core/sudoku/random'

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
