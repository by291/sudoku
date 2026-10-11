import { parseBoard } from './board'
import type { Board, Difficulty } from './types'

export type PuzzleTemplate = { difficulty: Difficulty; givens: Board; solution: Board }
function literalBoard(text: string): Board {
  const parsed = parseBoard(Array.from(text, Number))
  if (!parsed.valid) throw new Error(`Invalid template: ${parsed.issues.join('; ')}`)
  return parsed.value
}
const solution = literalBoard(
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179',
)
// Frozen sudoku-v1 fixtures, independently unique. Medium requires locked candidates;
// Hard additionally requires the row-4 pair {2, 4} in cells 33 and 34.
export const TEMPLATES: readonly PuzzleTemplate[] = [
  {
    difficulty: 'easy',
    solution,
    givens: literalBoard(
      '530070000600195000098000060800060003400803001700020006060000280000419005000080079',
    ),
  },
  {
    difficulty: 'medium',
    solution,
    givens: literalBoard(
      '030070012000105000008342500000001403000803091013024000000000280207000005040080070',
    ),
  },
  {
    difficulty: 'hard',
    solution,
    givens: literalBoard(
      '004600000600190308190000060800701000000000090003020050901000080007409035005000100',
    ),
  },
]
