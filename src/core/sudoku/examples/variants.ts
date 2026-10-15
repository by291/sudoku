import { parseBoard } from '@/core/sudoku/board'
import type { Board, Difficulty, StandardDifficulty } from '@/core/sudoku/types'
import type { NewSudokuVariant, PuzzleRules } from '@/core/sudoku/rules/types'

export type VariantTemplate = {
  rules: PuzzleRules
  givens: Board
  solution: Board
  difficulty: Difficulty
}

function literalBoard(text: string): Board {
  const parsed = parseBoard(Array.from(text, Number))
  if (!parsed.valid) {
    throw new Error('Invalid authored variant board')
  }

  return parsed.value
}

function tiers(
  rules: PuzzleRules,
  solution: Board,
  givens: Record<StandardDifficulty, string>,
): Record<Difficulty, readonly VariantTemplate[]> {
  const make = (difficulty: StandardDifficulty): VariantTemplate => ({
    rules,
    solution,
    difficulty,
    givens: literalBoard(givens[difficulty]),
  })
  return { easy: [make('easy')], medium: [make('medium')], hard: [make('hard')], expert: [] }
}

// Authored teaching/grading examples and region presets. Generation never delivers these boards.
// Their uniqueness is independently checked in tests.
// Difficulty follows the explained rule-aware trace, and removing variant rules changes solvability.
const diagonalRules: PuzzleRules = { kind: 'diagonal' }

const diagonalSolution = literalBoard(
  '123456789456789123789123456935241867617538294842697531298314675371865942564972318',
)

const jigsawRules: PuzzleRules = {
  kind: 'jigsaw',
  regions: [
    [0, 1, 12, 9, 10, 11, 18, 19, 20],
    [3, 4, 5, 2, 13, 14, 21, 22, 23],
    [6, 7, 8, 15, 16, 17, 24, 25, 26],
    [27, 28, 29, 36, 37, 38, 45, 46, 47],
    [30, 31, 32, 39, 40, 41, 48, 49, 50],
    [33, 34, 35, 42, 43, 44, 51, 52, 53],
    [54, 55, 56, 63, 64, 65, 72, 73, 74],
    [57, 58, 59, 66, 67, 68, 75, 76, 77],
    [60, 61, 62, 69, 70, 71, 78, 79, 80],
  ],
}

const jigsawSolution = literalBoard(
  '123645789789312456456978123234756891567189234891423567345867912678291345912534678',
)

const killerRules: PuzzleRules = {
  kind: 'killer',
  cages: [
    { cells: [0, 1, 2], sum: 6 },
    { cells: [3, 4, 5], sum: 15 },
    { cells: [6, 7, 8], sum: 24 },
    { cells: [9, 10, 11], sum: 15 },
    { cells: [12, 13, 14], sum: 24 },
    { cells: [15, 16, 17], sum: 6 },
    { cells: [18, 19, 20], sum: 24 },
    { cells: [21, 22, 23], sum: 6 },
    { cells: [24, 25, 26], sum: 15 },
    { cells: [27, 28, 29], sum: 9 },
    { cells: [30, 31, 32], sum: 18 },
    { cells: [33, 34, 35], sum: 18 },
    { cells: [36, 37, 38], sum: 18 },
    { cells: [39, 40, 41], sum: 18 },
    { cells: [42, 43, 44], sum: 9 },
    { cells: [45, 46, 47], sum: 18 },
    { cells: [48, 49, 50], sum: 9 },
    { cells: [51, 52, 53], sum: 18 },
    { cells: [54, 55, 56], sum: 12 },
    { cells: [57, 58, 59], sum: 21 },
    { cells: [60, 61, 62], sum: 12 },
    { cells: [63, 64, 65], sum: 21 },
    { cells: [66, 67, 68], sum: 12 },
    { cells: [69, 70, 71], sum: 12 },
    { cells: [72, 73, 74], sum: 12 },
    { cells: [75, 76, 77], sum: 12 },
    { cells: [78, 79, 80], sum: 21 },
  ],
}

const killerSolution = literalBoard(
  '123456789456789123789123456234567891567891234891234567345678912678912345912345678',
)

const thermoRules: PuzzleRules = { kind: 'thermo', paths: [[0, 1, 2, 3, 4, 5, 6, 7, 8]] }

const thermoSolution = literalBoard(
  '123456789456789123789123456234567891567891234891234567345678912678912345912345678',
)

const arrowRules: PuzzleRules = { kind: 'arrow', arrows: [{ circle: 8, shaft: [16, 24, 32, 40] }] }

const arrowSolution = literalBoard(
  '567219348189374526234658179658743291793821654412965783325486917876192435941537862',
)

export const VARIANT_TEMPLATES: Record<
  NewSudokuVariant,
  Record<Difficulty, readonly VariantTemplate[]>
> = {
  diagonal: tiers(diagonalRules, diagonalSolution, {
    easy: '003050780050780123089100450935040807000530200042007501000010675000865940004070300',
    medium: '100000080000709023000023400930000800000508000040000000000000605000060000560972000',
    hard: '000400089450000003000100006000000060010508000002007000000000070070060040000900000',
  }),
  jigsaw: tiers(jigsawRules, jigsawSolution, {
    easy: '000005780089010006050900123004000000060080000801423000040867902070090300000500000',
    medium: '003000709780000050050000100204700001007080230090400000040060000008201300002000000',
    hard: '000005780780000000006900120004006001067009200891420560040000000008000300902500670',
  }),
  killer: tiers(killerRules, killerSolution, {
    easy: '020006789056789123080120456004507800000090000801234000045678912070012300912345600',
    medium: '020006080056000003080100456004000000000090000800234000040678900070010300900340000',
    hard: '120000000000000003000100400000007000500000000000000000005000012000900300002000008',
  }),
  thermo: tiers(thermoRules, thermoSolution, {
    easy: '020006080056009003080100456004507000060090000801234000040678902070012300900340000',
    medium: '023450780050700000009020450004567801000000030800004000000000902070000000000345000',
    hard: '000000000000080000709000000200067001000801030000000500000678000000900005910000008',
  }),
  arrow: tiers(arrowRules, arrowSolution, {
    easy: '500210348089000526230008000658703201000821600412905780025486000076102435941537862',
    medium: '500210348080000020230000000658703001000001600410905080000480000006002000941530860',
    hard: '500200340000000020230000000650700001000000600400905080000480000006002000941530800',
  }),
}
