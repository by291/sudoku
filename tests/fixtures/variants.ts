import type { Board } from '@/core/sudoku/types'
import type { PuzzleRules } from '@/core/sudoku/rules'
import type { NewSudokuVariant } from '@/core/sudoku/rules'
import { parseBoard } from '@/core/sudoku/board'

export const ARROW_REPEAT_RULES: PuzzleRules = {
  kind: 'arrow',
  arrows: [{ circle: 8, shaft: [16, 24, 32, 40] }],
}
export const ARROW_REPEAT_BOARD: Board = Array.from({ length: 81 }, (_, cell) => {
  if (cell === 8) return 8
  if (cell === 16 || cell === 40) return 2
  if (cell === 24) return 1
  if (cell === 32) return 3
  return 0
})
export const FULL_LENGTH_THERMO_RULES: PuzzleRules = {
  kind: 'thermo',
  paths: [[0, 1, 2, 3, 4, 5, 6, 7, 8]],
}
function literalBoard(text: string): Board {
  const result = parseBoard(Array.from(text, Number))
  if (!result.valid) throw new Error('Invalid literal variant fixture')
  return result.value
}
const latinSolution = literalBoard(
  '123456789456789123789123456234567891567891234891234567345678912678912345912345678',
)
const diagonalSolution = literalBoard(
  '123456789456789123789123456935241867617538294842697531298314675371865942564972318',
)
const arrowSolution = literalBoard(
  '567219348189374526234658179658743291793821654412965783325486917876192435941537862',
)
const jigsawSolution = latinSolution.map((_, cell) => {
  const rows = [0, 2, 1, 3, 4, 5, 6, 7, 8]
  const columns = [0, 1, 2, 5, 3, 4, 6, 7, 8]
  return latinSolution[rows[Math.floor(cell / 9)] * 9 + columns[cell % 9]]
})
export const JIGSAW_REGIONS: readonly (readonly number[])[] = Array.from(
  { length: 9 },
  (_, region) =>
    Array.from({ length: 9 }, (_, offset) => {
      const cell =
        Math.floor(region / 3) * 27 + (region % 3) * 3 + Math.floor(offset / 3) * 9 + (offset % 3)
      return cell === 2 ? 12 : cell === 12 ? 2 : cell
    }),
)
type VariantFixture = { rules: PuzzleRules; givens: Board; solution: Board }
function oneHole(rules: PuzzleRules, solution: Board): VariantFixture {
  return { rules, solution, givens: solution.map((digit, cell) => (cell === 0 ? 0 : digit)) }
}
export const VARIANT_FIXTURES: Record<NewSudokuVariant, VariantFixture> = {
  diagonal: oneHole({ kind: 'diagonal' }, diagonalSolution),
  jigsaw: oneHole({ kind: 'jigsaw', regions: JIGSAW_REGIONS }, jigsawSolution),
  killer: oneHole(
    {
      kind: 'killer',
      cages: Array.from({ length: 27 }, (_, cage) => {
        const cells = [cage * 3, cage * 3 + 1, cage * 3 + 2]
        return { cells, sum: cells.reduce((sum, cell) => sum + latinSolution[cell], 0) }
      }),
    },
    latinSolution,
  ),
  thermo: oneHole(FULL_LENGTH_THERMO_RULES, latinSolution),
  arrow: oneHole(ARROW_REPEAT_RULES, arrowSolution),
}
