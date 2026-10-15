import type {
  SudokuVariant,
  PuzzleRules,
  CompiledVariantRules,
  VariantRuleDefinition,
} from '@/core/sudoku/rules/types'
import { CLASSIC_RULE_DEFINITION } from '@/core/sudoku/rules/definitions/classic'
import { DIAGONAL_RULE_DEFINITION } from '@/core/sudoku/rules/definitions/diagonal'
import { JIGSAW_RULE_DEFINITION } from '@/core/sudoku/rules/definitions/jigsaw'
import { KILLER_RULE_DEFINITION } from '@/core/sudoku/rules/definitions/killer'
import { THERMO_RULE_DEFINITION } from '@/core/sudoku/rules/definitions/thermo'
import { ARROW_RULE_DEFINITION } from '@/core/sudoku/rules/definitions/arrow'

export const VARIANT_RULE_DEFINITIONS = {
  classic: CLASSIC_RULE_DEFINITION,
  diagonal: DIAGONAL_RULE_DEFINITION,
  jigsaw: JIGSAW_RULE_DEFINITION,
  killer: KILLER_RULE_DEFINITION,
  thermo: THERMO_RULE_DEFINITION,
  arrow: ARROW_RULE_DEFINITION,
} satisfies { [K in SudokuVariant]: VariantRuleDefinition<K> }

export function compileVariantRules(rules: PuzzleRules): CompiledVariantRules {
  // Narrow the discriminant before calling heterogeneous definitions; no type-erasing casts.
  switch (rules.kind) {
    case 'classic':
      return VARIANT_RULE_DEFINITIONS.classic.compile(rules)
    case 'diagonal':
      return VARIANT_RULE_DEFINITIONS.diagonal.compile(rules)
    case 'jigsaw':
      return VARIANT_RULE_DEFINITIONS.jigsaw.compile(rules)
    case 'killer':
      return VARIANT_RULE_DEFINITIONS.killer.compile(rules)
    case 'thermo':
      return VARIANT_RULE_DEFINITIONS.thermo.compile(rules)
    case 'arrow':
      return VARIANT_RULE_DEFINITIONS.arrow.compile(rules)
  }
}
