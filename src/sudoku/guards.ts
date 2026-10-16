import type { EngineInfo } from '@sudoku/wasm'

const BRIDGE_VERSION = 1
const PUZZLE_VERSION = 'sudoku-v11'
const VARIANT_PUZZLE_VERSION = 'sudoku-variants-v11'
const RATING_VERSION = 'sudoku-rating-v2'
const REQUIRED_EXPORTS = [
  'engine_info',
  'derive_seed',
  'generate',
  'assess',
  'hint',
  'count_solutions',
  'validate_puzzle',
  'validate_assessment',
  'validate_hint_evidence',
  'transform_rules',
  'preparedpuzzle_new',
  'preparedpuzzle_edit',
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
