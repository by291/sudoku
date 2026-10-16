import { isBoard } from '@/sudoku/values'
import type { Board, Difficulty } from '@reference/core/sudoku/types'

export type ClassicPuzzleFixture = { difficulty: Difficulty; givens: Board; solution: Board }
function literalBoard(text: string): Board {
  const board = Array.from(text, Number)
  if (!isBoard(board)) {
    throw new Error('Invalid authored fixture board')
  }

  return board
}

const solution = literalBoard(
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179',
)
// Authored grading fixtures, independently unique. Medium requires locked candidates;
// Hard additionally requires the row-4 pair {2, 4} in cells 33 and 34.
export const CLASSIC_PUZZLE_FIXTURES: readonly ClassicPuzzleFixture[] = [
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
  {
    difficulty: 'expert',
    // This authored snapshot needs three coloring steps; independent tests verify uniqueness and links.
    solution: literalBoard(
      '481352796725689143639174582862415379517938264394726851143597628256843917978261435',
    ),
    givens: literalBoard(
      '081052006725080000009100000002005009000000004394000050000090020050003907000200035',
    ),
  },
]
