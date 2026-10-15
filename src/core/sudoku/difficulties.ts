import type { SudokuVariant } from '@/core/sudoku/rules/types'
import type { Difficulty } from '@/core/sudoku/types'

const standard: readonly Difficulty[] = ['easy', 'medium', 'hard']
export const DIFFICULTY_CAPABILITIES = {
  classic: [...standard, 'expert'],
  diagonal: standard,
  jigsaw: standard,
  killer: standard,
  thermo: standard,
  arrow: standard,
} satisfies Record<SudokuVariant, readonly Difficulty[]>

export function supportedDifficulties(variant: SudokuVariant): readonly Difficulty[] {
  return DIFFICULTY_CAPABILITIES[variant]
}

export function supportsDifficulty(variant: SudokuVariant, difficulty: Difficulty): boolean {
  return supportedDifficulties(variant).includes(difficulty)
}
