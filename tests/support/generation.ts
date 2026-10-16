import { createGenerationInput } from '@/sudoku/generationInput'
import type { Difficulty, SudokuVariant } from '@/sudoku/contracts'
import { deriveSeed } from '../migration/v11-random'

/** Test labels are byte material for the independent v11 recipe, never a production seed overload. */
export function seedForTest(label: string): Uint8Array {
  return deriveSeed(new TextEncoder().encode(label))
}

export function generationInput(variant: SudokuVariant, difficulty: Difficulty, label: string) {
  return createGenerationInput(variant, difficulty, seedForTest(label))
}
