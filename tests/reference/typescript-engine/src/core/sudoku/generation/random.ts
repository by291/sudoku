import type { GenerationInput } from '@/core/sudoku/generation/types'
import { seededRandom } from '@/core/sudoku/random'

/** Separate version-owned streams prevent failed neighborhoods from replacing future terminals. */
export function createGenerationRandom(
  input: GenerationInput,
  phase: 'terminal' | 'geometry' | 'candidate',
  layoutIndex: number,
  proposalIndex = 0,
): () => number {
  return seededRandom(
    JSON.stringify([
      input.puzzleVersion,
      input.variant,
      input.difficulty,
      input.seed,
      phase,
      layoutIndex,
      proposalIndex,
    ]),
  )
}
