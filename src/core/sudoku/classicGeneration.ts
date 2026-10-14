import type { GenerationMetrics } from '@/core/sudoku/generation'
import { calculateCandidates, digitsIn, isComplete } from '@/core/sudoku/board'
import { consumeWork, createWorkBudget } from '@/core/sudoku/budget'
import type { WorkBudget } from '@/core/sudoku/budget'
import { seededRandom, shuffle } from '@/core/sudoku/random'
import { BOARD_SIZE, BOX_SIZE, DIGITS, UNIT_SIZE } from '@/core/sudoku/types'
import type { Board, CellValue } from '@/core/sudoku/types'
import type {
  GenerationInput,
  GenerationLimits,
  GenerationAttemptResult,
} from '@/core/sudoku/generation'
import { countSolutions } from '@/core/sudoku/search'
import { assessPuzzleWithBudget, createAssessmentInput } from '@/core/sudoku/rating'
import { TEMPLATES } from '@/core/sudoku/templates'
import type { PuzzleTemplate } from '@/core/sudoku/templates'

/** Consumes the supplied seeded stream and node budget; never exposes an incomplete grid. */
export function constructClassicTerminal(
  random: () => number,
  budget: WorkBudget,
): { status: 'ready'; solution: Board } | { status: 'budget-exhausted' } {
  const board: CellValue[] = Array(BOARD_SIZE).fill(0)
  let exhausted = false

  function visit(): boolean {
    if (!consumeWork(budget)) {
      exhausted = true
      return false
    }

    const candidates = calculateCandidates(board)
    let target = -1
    let smallest = 10
    for (let cell = 0; cell < BOARD_SIZE; cell++) {
      if (board[cell] !== 0) {
        continue
      }
      const choices = digitsIn(candidates[cell]).length
      if (choices === 0) {
        return false
      }
      if (choices < smallest) {
        target = cell
        smallest = choices
      }
    }
    if (target === -1) {
      return true
    }

    // MRV ties use ascending cells; each visited node shuffles its ascending digit choices once.
    for (const digit of shuffle(digitsIn(candidates[target]), random)) {
      board[target] = digit
      if (visit()) {
        return true
      }
      board[target] = 0
      if (exhausted) {
        return false
      }
    }

    return false
  }

  return visit() ? { status: 'ready', solution: [...board] } : { status: 'budget-exhausted' }
}

function transformFallback(template: PuzzleTemplate, random: () => number): PuzzleTemplate {
  const digits = shuffle(DIGITS, random)
  const axis = () =>
    shuffle([0, 1, 2], random).flatMap((group) =>
      shuffle([0, 1, 2], random).map((offset) => group * BOX_SIZE + offset),
    )
  const rows = axis()
  const columns = axis()
  const transpose = random() < 0.5
  const map = (board: Board): Board =>
    board.map((_, cell) => {
      const row = rows[Math.floor(cell / UNIT_SIZE)]
      const column = columns[cell % UNIT_SIZE]
      const value = board[transpose ? column * UNIT_SIZE + row : row * UNIT_SIZE + column]
      return value === 0 ? 0 : digits[value - 1]
    })

  return {
    difficulty: template.difficulty,
    givens: map(template.givens),
    solution: map(template.solution),
  }
}

const CLUE_TARGETS = { easy: 36, medium: 32, hard: 30, expert: 28 } as const
const TIER_ORDER = { easy: 0, medium: 1, hard: 2, expert: 3 } as const
const CELL_INDICES = Array.from({ length: BOARD_SIZE }, (_, cell) => cell)

export function generateClassicPuzzle(
  input: Extract<GenerationInput, { variant: 'classic' }>,
  limits: GenerationLimits,
  metrics: GenerationMetrics,
): GenerationAttemptResult {
  const random = seededRandom(`${input.puzzleVersion}:${input.difficulty}:${input.seed}`)
  // All layouts and checks consume this one allowance; only fallback validation gets a fresh one.
  const budget = createWorkBudget(limits.maxWork)
  let fallbackBudget: WorkBudget | null = null
  try {
    const rules = { kind: 'classic' } as const
    const assess = (board: Board, work: WorkBudget) =>
      assessPuzzleWithBudget(
        createAssessmentInput(board, rules, { maxSteps: limits.maxSteps, maxWork: work.limit }),
        work,
      )

    for (let layout = 0; layout < limits.maxLayouts && budget.used < budget.limit; layout++) {
      metrics.layouts++
      const terminal = constructClassicTerminal(random, budget)
      if (terminal.status === 'budget-exhausted') {
        break
      }
      const givens = [...terminal.solution]
      let clues = BOARD_SIZE

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

        const rating = assess(givens, budget)
        if (rating.status === 'budget-exhausted') {
          givens[cell] = previous
          break
        }
        if (rating.status === 'invalid') {
          return { status: 'failed', reason: rating.issues.join('; ') }
        }
        if (
          rating.status !== 'rated' ||
          TIER_ORDER[rating.summary.difficulty] > TIER_ORDER[input.difficulty]
        ) {
          givens[cell] = previous
          continue
        }

        clues--
        if (
          clues <= CLUE_TARGETS[input.difficulty] &&
          rating.summary.difficulty === input.difficulty
        ) {
          return {
            status: 'ready',
            source: 'generated',
            assessment: rating.summary,
            puzzle: {
              givens: [...givens],
              solution: terminal.solution,
              difficulty: input.difficulty,
              seed: input.seed,
              puzzleVersion: input.puzzleVersion,
              rules,
            },
          }
        }
      }
    }

    const authored = TEMPLATES.find((template) => template.difficulty === input.difficulty)
    if (!authored) {
      return { status: 'failed', reason: 'No authored fallback for the requested difficulty' }
    }
    const fallback = transformFallback(authored, random)
    fallbackBudget = createWorkBudget(limits.fallbackWork)
    const unique = countSolutions(fallback.givens, {
      maxSolutions: 2,
      nodeBudget: fallbackBudget.limit,
      workBudget: fallbackBudget,
    })
    if (unique.status === 'budget-exhausted') {
      return { status: 'budget-exhausted', stage: 'fallback-validation' }
    }
    const rating = assess(fallback.givens, fallbackBudget)
    if (rating.status === 'budget-exhausted') {
      return { status: 'budget-exhausted', stage: 'fallback-validation' }
    }
    if (
      unique.count !== 1 ||
      rating.status !== 'rated' ||
      rating.summary.difficulty !== input.difficulty ||
      !isComplete(fallback.solution)
    ) {
      return { status: 'failed', reason: 'Fallback validation failed' }
    }

    return {
      status: 'ready',
      source: 'fallback',
      assessment: rating.summary,
      puzzle: { ...fallback, seed: input.seed, puzzleVersion: input.puzzleVersion, rules },
    }
  } finally {
    metrics.constructionWork = budget.used
    metrics.fallbackWork = fallbackBudget?.used ?? 0
  }
}
