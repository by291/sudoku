import type { Board, Difficulty, ParseResult } from '@/core/sudoku/types'
import { parseBoard, isComplete } from '@/core/sudoku/board'
import { isDifficulty, isRecord } from '@/core/sudoku/types'
import { compileRules, parseRules } from '@/core/sudoku/rules/context'
import type { PuzzleRules } from '@/core/sudoku/rules/types'
import { supportsDifficulty } from '@/core/sudoku/difficulties'

export type Puzzle = {
  givens: Board
  solution: Board
  difficulty: Difficulty
  seed: string
  puzzleVersion: string
  rules: PuzzleRules
}

export function parsePuzzle(value: unknown): ParseResult<Puzzle> {
  if (
    !isRecord(value) ||
    !isDifficulty(value.difficulty) ||
    typeof value.seed !== 'string' ||
    !value.seed ||
    typeof value.puzzleVersion !== 'string' ||
    !value.puzzleVersion
  ) {
    return { valid: false, issues: ['Invalid puzzle metadata'] }
  }

  const givens = parseBoard(value.givens)
  const solution = parseBoard(value.solution)
  const rules = parseRules(value.rules)
  if (!givens.valid || !solution.valid || !rules.valid) {
    return { valid: false, issues: ['Invalid puzzle board or rules'] }
  }

  if (!supportsDifficulty(rules.value.kind, value.difficulty)) {
    return { valid: false, issues: ['Expert difficulty is supported only for Classic'] }
  }

  if (
    !isComplete(solution.value, compileRules(rules.value)) ||
    givens.value.some((digit, cell) => digit !== 0 && digit !== solution.value[cell])
  ) {
    return { valid: false, issues: ['Solution does not satisfy puzzle givens'] }
  }

  return {
    valid: true,
    value: {
      givens: givens.value,
      solution: solution.value,
      difficulty: value.difficulty,
      seed: value.seed,
      puzzleVersion: value.puzzleVersion,
      rules: rules.value,
    },
  }
}
