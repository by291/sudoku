import type { NewSudokuVariant, PuzzleRules, RulesFor } from '@/core/sudoku/ruleTypes'
import type { Board } from '@/core/sudoku/types'
import type { WorkBudget } from '@/core/sudoku/budget'
import { DIAGONAL_GENERATION_STRATEGY } from '@/core/sudoku/variants/diagonal'
import { JIGSAW_GENERATION_STRATEGY } from '@/core/sudoku/variants/jigsaw'
import { KILLER_GENERATION_STRATEGY } from '@/core/sudoku/variants/killer'
import { THERMO_GENERATION_STRATEGY } from '@/core/sudoku/variants/thermo'
import { ARROW_GENERATION_STRATEGY } from '@/core/sudoku/variants/arrow'

export type VariantGenerationStrategy<K extends NewSudokuVariant> = {
  readonly allowsDigitMap: boolean
  readonly allowsComplement: boolean
  createGeometry(
    rules: RulesFor<K>,
    solution: Board,
    random: () => number,
    budget: WorkBudget,
  ): RulesFor<K> | null
  transformRules(
    rules: RulesFor<K>,
    cellMap: (cell: number) => number,
    complement: boolean,
  ): RulesFor<K>
}

export const VARIANT_GENERATION_STRATEGIES = {
  diagonal: DIAGONAL_GENERATION_STRATEGY,
  jigsaw: JIGSAW_GENERATION_STRATEGY,
  killer: KILLER_GENERATION_STRATEGY,
  thermo: THERMO_GENERATION_STRATEGY,
  arrow: ARROW_GENERATION_STRATEGY,
} satisfies { [K in NewSudokuVariant]: VariantGenerationStrategy<K> }

export function createVariantGeometry(
  rules: PuzzleRules,
  solution: Board,
  random: () => number,
  budget: WorkBudget,
): PuzzleRules | null {
  switch (rules.kind) {
    case 'classic':
      return null
    case 'diagonal':
      return VARIANT_GENERATION_STRATEGIES.diagonal.createGeometry(rules, solution, random, budget)
    case 'jigsaw':
      return VARIANT_GENERATION_STRATEGIES.jigsaw.createGeometry(rules, solution, random, budget)
    case 'killer':
      return VARIANT_GENERATION_STRATEGIES.killer.createGeometry(rules, solution, random, budget)
    case 'thermo':
      return VARIANT_GENERATION_STRATEGIES.thermo.createGeometry(rules, solution, random, budget)
    case 'arrow':
      return VARIANT_GENERATION_STRATEGIES.arrow.createGeometry(rules, solution, random, budget)
  }
}

export function transformVariantRules(
  rules: Exclude<PuzzleRules, { kind: 'classic' }>,
  cellMap: (cell: number) => number,
  complement: boolean,
): PuzzleRules {
  switch (rules.kind) {
    case 'diagonal':
      return VARIANT_GENERATION_STRATEGIES.diagonal.transformRules(rules, cellMap, complement)
    case 'jigsaw':
      return VARIANT_GENERATION_STRATEGIES.jigsaw.transformRules(rules, cellMap, complement)
    case 'killer':
      return VARIANT_GENERATION_STRATEGIES.killer.transformRules(rules, cellMap, complement)
    case 'thermo':
      return VARIANT_GENERATION_STRATEGIES.thermo.transformRules(rules, cellMap, complement)
    case 'arrow':
      return VARIANT_GENERATION_STRATEGIES.arrow.transformRules(rules, cellMap, complement)
  }
}
