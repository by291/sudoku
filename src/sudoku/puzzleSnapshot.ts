import type { Puzzle } from '@/sudoku/contracts'
import type { MainSudokuEngine } from '@/sudoku/mainEngine'
import { isBoard, isDifficulty, isRecord } from '@/sudoku/values'
import { isRulesShape } from '@/sudoku/guards'
import { copyRules } from '@/sudoku/ruleInput'

export type PuzzleSnapshotResult =
  | { status: 'valid'; value: Puzzle }
  | { status: 'invalid'; issues: readonly string[] }
  | { status: 'incomplete' }

/** Historical text metadata stays in JS; only mathematical content crosses into Rust. */
export function validatePuzzleSnapshot(
  value: unknown,
  validator: Pick<MainSudokuEngine, 'validatePuzzle'>,
): PuzzleSnapshotResult {
  if (
    !isRecord(value) ||
    !isDifficulty(value.difficulty) ||
    typeof value.seed !== 'string' ||
    !value.seed.length ||
    typeof value.puzzleVersion !== 'string' ||
    !value.puzzleVersion.length
  ) {
    return { status: 'invalid', issues: ['Invalid puzzle metadata'] }
  }
  if (!isBoard(value.givens) || !isBoard(value.solution) || !isRulesShape(value.rules)) {
    return { status: 'invalid', issues: ['Invalid puzzle board or rules'] }
  }
  const version = /^sudoku-(?:variants-)?(v11|v12)$/.exec(value.puzzleVersion)?.[1]
  if (
    version &&
    (!/^[0-9a-f]{64}$/.test(value.seed) ||
      value.puzzleVersion !==
        (value.rules.kind === 'classic' ? `sudoku-${version}` : `sudoku-variants-${version}`))
  ) {
    return { status: 'invalid', issues: ['Invalid versioned puzzle identity'] }
  }
  const content = {
    givens: [...value.givens],
    solution: [...value.solution],
    rules: copyRules(value.rules),
    difficulty: value.difficulty,
  }
  const result = validator.validatePuzzle(content)
  return result.status === 'valid'
    ? {
        status: 'valid',
        value: { ...content, seed: value.seed, puzzleVersion: value.puzzleVersion },
      }
    : result
}
