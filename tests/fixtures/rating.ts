import { CLASSIC_PUZZLE_FIXTURES } from './classicPuzzles'
import { VARIANT_TEMPLATES } from '@reference/core/sudoku/examples/variants'
import { SUDOKU_VARIANTS } from '@reference/core/sudoku/rules/types'
import type { PuzzleRules } from '@reference/core/sudoku/rules/types'
import type { Board, Difficulty } from '@reference/core/sudoku/types'

export type RatingFixture = {
  id: string
  board: Board
  rules: PuzzleRules
  solution: Board
  difficulty: Difficulty
}

// These authored boards predate the new assessor; their solutions are independently verified.
export const RATING_FIXTURES: readonly RatingFixture[] = SUDOKU_VARIANTS.flatMap<RatingFixture>(
  (variant) => {
    if (variant === 'classic') {
      return CLASSIC_PUZZLE_FIXTURES.map((template) => ({
        id: `classic-${template.difficulty}`,
        board: template.givens,
        rules: { kind: 'classic' } as const,
        solution: template.solution,
        difficulty: template.difficulty,
      }))
    }

    return (['easy', 'medium', 'hard'] as const).map((difficulty) => {
      const template = VARIANT_TEMPLATES[variant][difficulty][0]

      return { id: `${variant}-${difficulty}`, board: template.givens, ...template }
    })
  },
)
