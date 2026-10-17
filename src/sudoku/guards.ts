import { BOARD_SIZE } from '@/sudoku/values'
import type { EngineInfo } from '@sudoku/wasm'
import type { Difficulty, PuzzleRules, SudokuVariant } from '@/sudoku/contracts'

export const BRIDGE_VERSION = 3
export const PUZZLE_VERSION = 'sudoku-v11'
export const VARIANT_PUZZLE_VERSION = 'sudoku-variants-v11'
export const RATING_VERSION = 'sudoku-rating-v2'
const REQUIRED_EXPORTS = [
  'engine_info',
  'derive_seed',
  'generate',
  'assess',
  'assess_summary',
  'hint',
  'count_solutions',
  'validate_puzzle',
  'validate_rules',
  'parse_hint',
  'parse_conflicts',
  'parse_edit',
  'parse_live_assessment_outcome',
  'preparedpuzzle_liveExecution',
  'validate_teaching_step',
  'validate_assessment',
  'validate_hint_evidence',
  'transform_rules',
  'preparedpuzzle_new',
  'preparedpuzzle_edit',
  'preparedpuzzle_review_entries',
]

export function validateModuleExports(module: WebAssembly.Module): void {
  const exports = new Set(
    WebAssembly.Module.exports(module)
      .filter((item) => item.kind === 'function')
      .map((item) => item.name),
  )
  if (!REQUIRED_EXPORTS.every((name) => exports.has(name))) {
    throw new Error('Sudoku module exports do not match the bridge')
  }
}

export function validateEngineInfo(info: EngineInfo): void {
  if (
    info.bridgeVersion !== BRIDGE_VERSION ||
    info.puzzleVersion !== PUZZLE_VERSION ||
    info.variantPuzzleVersion !== VARIANT_PUZZLE_VERSION ||
    info.ratingVersion !== RATING_VERSION
  ) {
    throw new Error('Sudoku engine bridge or algorithm version mismatch')
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isDifficulty(value: unknown): value is Difficulty {
  return value === 'easy' || value === 'medium' || value === 'hard' || value === 'expert'
}

const VARIANT_TAGS = {
  classic: true,
  diagonal: true,
  jigsaw: true,
  killer: true,
  thermo: true,
  arrow: true,
} satisfies Record<SudokuVariant, true>

export function isVariant(value: unknown): value is SudokuVariant {
  return typeof value === 'string' && Object.hasOwn(VARIANT_TAGS, value)
}

function cellList(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every(
      (cell) =>
        typeof cell === 'number' && Number.isInteger(cell) && cell >= 0 && cell < BOARD_SIZE,
    )
  )
}

const RULE_SHAPES = {
  classic: () => true,
  diagonal: () => true,
  jigsaw: (value) => Array.isArray(value.regions) && value.regions.every(cellList),
  killer: (value) =>
    Array.isArray(value.cages) &&
    value.cages.every(
      (cage: unknown) =>
        isRecord(cage) &&
        cellList(cage.cells) &&
        typeof cage.sum === 'number' &&
        Number.isSafeInteger(cage.sum),
    ),
  thermo: (value) => Array.isArray(value.paths) && value.paths.every(cellList),
  arrow: (value) =>
    Array.isArray(value.arrows) &&
    value.arrows.every(
      (arrow: unknown) =>
        isRecord(arrow) &&
        typeof arrow.circle === 'number' &&
        Number.isInteger(arrow.circle) &&
        arrow.circle >= 0 &&
        arrow.circle < BOARD_SIZE &&
        cellList(arrow.shaft),
    ),
} satisfies Record<SudokuVariant, (value: Record<string, unknown>) => boolean>

/** Structural transport guard only; Rust validates connected geometry, partitions and equations. */
export function isRulesShape(value: unknown): value is PuzzleRules {
  return isRecord(value) && isVariant(value.kind) && RULE_SHAPES[value.kind](value)
}
