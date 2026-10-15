// Assemble construction separately from pure geometry definitions to avoid registry cycles.
import { constructClassicTerminal } from '@/core/sudoku/classicGeneration'
import { constructVariantLayout } from '@/core/sudoku/variantGeneration'
import { VARIANT_GENERATION_STRATEGIES } from '@/core/sudoku/generationStrategies'
import type {
  GenerationStrategy,
  LayoutConstructionResult,
  LayoutRandomStreams,
} from '@/core/sudoku/generationStrategies'
import { VARIANT_RULE_DEFINITIONS } from '@/core/sudoku/variantRegistry'
import type {
  NewSudokuVariant,
  SudokuVariant,
  VariantRuleDefinition,
} from '@/core/sudoku/ruleTypes'
import type { GenerationInput } from '@/core/sudoku/generation'
import type { WorkBudget } from '@/core/sudoku/budget'

function variantStrategy<K extends NewSudokuVariant>(
  kind: K,
  definition: VariantRuleDefinition<K>,
): GenerationStrategy<K> {
  const permissions = VARIANT_GENERATION_STRATEGIES[kind]

  return {
    allowsDigitMap: permissions.allowsDigitMap,
    allowsComplement: permissions.allowsComplement,
    construct(difficulty, random, budget) {
      const result = constructVariantLayout(kind, difficulty, random, budget)
      if (result.status !== 'ready') {
        return result
      }
      const parsed = definition.parse(result.rules)
      if (!parsed.valid) {
        return { status: 'failed', reason: parsed.issues.join('; ') }
      }

      return { status: 'ready', terminal: result.terminal, rules: parsed.value }
    },
  }
}

export const GENERATION_STRATEGIES = {
  classic: {
    allowsDigitMap: true,
    allowsComplement: true,
    construct(_difficulty, random, budget) {
      const terminal = constructClassicTerminal(random.terminal, budget)

      return terminal.status === 'ready'
        ? { status: 'ready', terminal: terminal.solution, rules: { kind: 'classic' } }
        : terminal
    },
  },
  diagonal: variantStrategy('diagonal', VARIANT_RULE_DEFINITIONS.diagonal),
  jigsaw: variantStrategy('jigsaw', VARIANT_RULE_DEFINITIONS.jigsaw),
  killer: variantStrategy('killer', VARIANT_RULE_DEFINITIONS.killer),
  thermo: variantStrategy('thermo', VARIANT_RULE_DEFINITIONS.thermo),
  arrow: variantStrategy('arrow', VARIANT_RULE_DEFINITIONS.arrow),
} satisfies { [K in SudokuVariant]: GenerationStrategy<K> }

export function constructGenerationLayout(
  input: GenerationInput,
  random: LayoutRandomStreams,
  budget: WorkBudget,
): LayoutConstructionResult {
  return GENERATION_STRATEGIES[input.variant].construct(input.difficulty, random, budget)
}
