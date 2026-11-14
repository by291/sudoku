import { isCellIndex, isDenseArrayOf, isRecord } from '@/sudoku/values'
import { isSudokuVariant } from '@/sudoku/catalogue'
import type { EngineInfo } from '@sudoku/wasm'
import type { PuzzleRules, SudokuVariant } from '@/sudoku/contracts'

export const BRIDGE_VERSION = 4
export const PUZZLE_VERSION = 'sudoku-v12'
export const VARIANT_PUZZLE_VERSION = 'sudoku-variants-v12'
export const RATING_VERSION = 'sudoku-rating-v2'
export const MAX_LOGICAL_STEPS = 500
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

/** Reject incompatible exports before creating a WASM instance. */
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

/** Verify the live instance reports the bridge and algorithm identities we expect. */
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

function cellList(value: unknown): value is number[] {
  return isDenseArrayOf(value, isCellIndex)
}

function isCageShape(value: unknown): value is { cells: number[]; sum: number } {
  return (
    isRecord(value) &&
    cellList(value.cells) &&
    typeof value.sum === 'number' &&
    Number.isSafeInteger(value.sum)
  )
}

function isArrowShape(value: unknown): value is { circle: number; shaft: number[] } {
  return isRecord(value) && isCellIndex(value.circle) && cellList(value.shaft)
}

const RULE_SHAPES = {
  classic: () => true,
  diagonal: () => true,
  jigsaw: (value) => isDenseArrayOf(value.regions, cellList),
  killer: (value) => isDenseArrayOf(value.cages, isCageShape),
  thermo: (value) => isDenseArrayOf(value.paths, cellList),
  arrow: (value) => isDenseArrayOf(value.arrows, isArrowShape),
} satisfies Record<SudokuVariant, (value: Record<string, unknown>) => boolean>

/** Structural transport guard only; Rust validates connected geometry, partitions and equations. */
export function isRulesShape(value: unknown): value is PuzzleRules {
  return isRecord(value) && isSudokuVariant(value.kind) && RULE_SHAPES[value.kind](value)
}
