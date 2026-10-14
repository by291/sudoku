import { SUDOKU_VARIANTS } from '@/core/sudoku/rules'
import { supportedDifficulties } from '@/core/sudoku/difficulties'

export const CORPUS_VERSION = 'local-product-corpus-v1'
export const CORPUS_SEEDS = Array.from(
  { length: 64 },
  (_, index) => `${CORPUS_VERSION}:seed:${String(index).padStart(3, '0')}`,
)
export const REGRESSION_SEEDS = [0, 17, 33, 63].map((index) => CORPUS_SEEDS[index])
export const KILLER_HARD_REGRESSION_SEEDS = [0, 9, 17, 33, 42, 63].map(
  (index) => CORPUS_SEEDS[index],
)
export const CORPUS_COMBINATIONS = SUDOKU_VARIANTS.flatMap((variant) =>
  supportedDifficulties(variant).map((difficulty) => ({ variant, difficulty })),
)
