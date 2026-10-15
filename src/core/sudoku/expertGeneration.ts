import { consumeWork } from '@/core/sudoku/budget'
import type { WorkBudget } from '@/core/sudoku/budget'
import { shuffle } from '@/core/sudoku/random'
import type { DifficultyAssessment, PreparedAssessment } from '@/core/sudoku/rating'
import { countSolutions } from '@/core/sudoku/search'
import { BOARD_SIZE } from '@/core/sudoku/types'
import type { Board } from '@/core/sudoku/types'

export type ExpertCheckpoint = { givens: Board; clues: number }

type RefinementResult =
  | { status: 'ready'; givens: Board; assessment: DifficultyAssessment }
  | { status: 'miss' }
  | { status: 'budget-exhausted'; stage: 'construction' }
  | { status: 'failed'; reason: string }

const MAX_REFINEMENTS = 2
const ADDED_CLUES = 2
const CELL_INDICES = Array.from({ length: BOARD_SIZE }, (_, cell) => cell)

/** Explore a unique Hard checkpoint using its known terminal, seeded stream and shared budget. */
export function refineExpertClues(
  solution: Board,
  checkpoint: ExpertCheckpoint,
  assessment: PreparedAssessment,
  random: () => number,
  budget: WorkBudget,
  maxClues: number,
): RefinementResult {
  let closest = checkpoint

  for (let refinement = 0; refinement < MAX_REFINEMENTS; refinement++) {
    if (!consumeWork(budget)) {
      return { status: 'budget-exhausted', stage: 'construction' }
    }

    const candidate = [...closest.givens]
    const additions = shuffle(
      CELL_INDICES.filter((cell) => candidate[cell] === 0),
      random,
    ).slice(0, ADDED_CLUES)
    for (const cell of additions) {
      candidate[cell] = solution[cell]
    }
    let clues = closest.clues + additions.length
    // Keep the additions during this pass so it explores a different clue mask.
    const removals = shuffle(
      CELL_INDICES.filter((cell) => candidate[cell] !== 0 && !additions.includes(cell)),
      random,
    )

    for (const cell of removals) {
      const previous = candidate[cell]
      candidate[cell] = 0
      const unique = countSolutions(candidate, {
        maxSolutions: 2,
        nodeBudget: budget.limit - budget.used,
        workBudget: budget,
      })
      if (unique.status === 'budget-exhausted') {
        return { status: 'budget-exhausted', stage: 'construction' }
      }
      if (unique.count === 0) {
        return { status: 'failed', reason: 'Expert refinement lost its known solution' }
      }
      if (unique.count !== 1) {
        candidate[cell] = previous
        continue
      }

      const rating = assessment.screen(candidate, budget)
      if (rating.status === 'budget-exhausted') {
        return { status: 'budget-exhausted', stage: 'construction' }
      }
      if (rating.status === 'invalid') {
        return { status: 'failed', reason: rating.issues.join('; ') }
      }
      if (rating.status !== 'rated') {
        candidate[cell] = previous
        continue
      }

      clues--
      if (rating.difficulty === 'expert' && clues <= maxClues) {
        return { status: 'ready', givens: candidate, assessment: rating.complete().summary }
      }
      if (rating.difficulty === 'hard' && clues <= closest.clues) {
        closest = { givens: [...candidate], clues }
      }
    }
  }

  return { status: 'miss' }
}
