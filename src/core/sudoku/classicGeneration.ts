import type { GenerationMetrics } from '@/core/sudoku/generation'
import { createWorkBudget } from '@/core/sudoku/budget'
import type { WorkBudget } from '@/core/sudoku/budget'
import { CLASSIC_CONTEXT } from '@/core/sudoku/rules'
import { constructUnitTerminal } from '@/core/sudoku/terminalConstruction'
import type { TerminalConstructionResult } from '@/core/sudoku/terminalConstruction'
import { seededRandom, shuffle } from '@/core/sudoku/random'
import { BOARD_SIZE } from '@/core/sudoku/types'
import type {
  GenerationInput,
  GenerationLimits,
  GenerationAttemptResult,
} from '@/core/sudoku/generation'
import { countSolutions } from '@/core/sudoku/search'
import { prepareAssessment } from '@/core/sudoku/rating'
import type { DifficultyAssessment } from '@/core/sudoku/rating'
import { refineExpertClues } from '@/core/sudoku/expertGeneration'
import type { ExpertCheckpoint } from '@/core/sudoku/expertGeneration'
import type { Board } from '@/core/sudoku/types'

/** Consumes the supplied seeded stream and node budget; never exposes an incomplete grid. */
export function constructClassicTerminal(
  random: () => number,
  budget: WorkBudget,
): TerminalConstructionResult {
  return constructUnitTerminal(CLASSIC_CONTEXT, random, budget)
}

const CLUE_TARGETS = { easy: 36, medium: 32, hard: 30, expert: 28 } as const
const TIER_ORDER = { easy: 0, medium: 1, hard: 2, expert: 3 } as const
const CELL_INDICES = Array.from({ length: BOARD_SIZE }, (_, cell) => cell)

function completedPuzzle(
  input: Extract<GenerationInput, { variant: 'classic' }>,
  solution: Board,
  givens: Board,
  assessment: DifficultyAssessment,
): GenerationAttemptResult {
  return {
    status: 'ready',
    source: 'generated',
    assessment,
    puzzle: {
      givens: [...givens],
      solution,
      difficulty: input.difficulty,
      seed: input.seed,
      puzzleVersion: input.puzzleVersion,
      rules: { kind: 'classic' },
    },
  }
}

export function generateClassicPuzzle(
  input: Extract<GenerationInput, { variant: 'classic' }>,
  limits: GenerationLimits,
  metrics: GenerationMetrics,
): GenerationAttemptResult {
  const random = seededRandom(`${input.puzzleVersion}:${input.difficulty}:${input.seed}`)
  // Every layout and validation shares this allowance; exhaustion cannot install another puzzle.
  const budget = createWorkBudget(limits.maxWork)
  try {
    const rules = { kind: 'classic' } as const
    const assessment = prepareAssessment(rules, {
      maxSteps: limits.maxSteps,
      maxWork: budget.limit,
    })

    for (let layout = 0; layout < limits.maxLayouts && budget.used < budget.limit; layout++) {
      metrics.layouts++
      const terminal = constructClassicTerminal(random, budget)
      if (terminal.status === 'budget-exhausted') {
        break
      }
      if (terminal.status === 'attempt-exhausted') {
        continue
      }
      if (terminal.status === 'failed') {
        return terminal
      }
      const givens = [...terminal.solution]
      let clues = BOARD_SIZE
      let hardCheckpoint: ExpertCheckpoint | null = null

      for (const cell of shuffle(CELL_INDICES, random)) {
        const previous = givens[cell]
        givens[cell] = 0
        const unique = countSolutions(givens, {
          maxSolutions: 2,
          nodeBudget: budget.limit - budget.used,
          workBudget: budget,
        })
        if (unique.status === 'budget-exhausted') {
          // Incomplete validation cannot justify keeping a removed clue.
          givens[cell] = previous
          break
        }
        if (unique.count === 0) {
          return { status: 'failed', reason: 'Constructed terminal lost its known solution' }
        }
        if (unique.count !== 1) {
          givens[cell] = previous
          continue
        }

        const rating = assessment.screen(givens, budget)
        if (rating.status === 'budget-exhausted') {
          givens[cell] = previous
          break
        }
        if (rating.status === 'invalid') {
          return { status: 'failed', reason: rating.issues.join('; ') }
        }
        if (
          rating.status !== 'rated' ||
          TIER_ORDER[rating.difficulty] > TIER_ORDER[input.difficulty]
        ) {
          givens[cell] = previous
          continue
        }

        clues--
        if (input.difficulty === 'expert' && rating.difficulty === 'hard') {
          hardCheckpoint = { givens: [...givens], clues }
        }
        if (clues <= CLUE_TARGETS[input.difficulty] && rating.difficulty === input.difficulty) {
          return completedPuzzle(input, terminal.solution, givens, rating.complete().summary)
        }
      }

      if (hardCheckpoint) {
        // Reuse this terminal before restarting. Every swap and validation still
        // consumes the original aggregate allowance. A separate seeded stream
        // keeps a missed refinement from changing later terminal/removal orders.
        const refinementRandom = seededRandom(
          `${input.puzzleVersion}:${input.difficulty}:${input.seed}:expert-refinement:${layout}`,
        )
        const refined = refineExpertClues(
          terminal.solution,
          hardCheckpoint,
          assessment,
          refinementRandom,
          budget,
          CLUE_TARGETS.expert,
        )
        if (refined.status === 'ready') {
          return completedPuzzle(input, terminal.solution, refined.givens, refined.assessment)
        }
        if (refined.status !== 'miss') {
          return refined
        }
      }
    }

    return { status: 'budget-exhausted', stage: 'construction' }
  } finally {
    metrics.constructionWork = budget.used
  }
}
