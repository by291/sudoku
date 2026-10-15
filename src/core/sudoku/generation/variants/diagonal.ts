import type { VariantGenerationStrategy } from '@/core/sudoku/generation/types'

export const DIAGONAL_GENERATION_STRATEGY: VariantGenerationStrategy<'diagonal'> = {
  allowsDigitMap: true,
  allowsComplement: true,

  createGeometry(rules) {
    return rules
  },

  transformRules(rules) {
    return rules
  },
}
