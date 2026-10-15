import {
  VARIANT_GENERATION_STRATEGIES,
  createVariantGeometry,
  transformVariantRules,
} from '@/core/sudoku/generation/variantStrategies'
import type { LayoutConstructionResult, LayoutRandomStreams } from '@/core/sudoku/generation/types'
import { irregularRegions } from '@/core/sudoku/rules/definitions/jigsaw'
import { isComplete } from '@/core/sudoku/board'
import { CLASSIC_CONTEXT, prepareRuleContext, parseRules } from '@/core/sudoku/rules/context'
import type { Board, CellValue, Digit, Difficulty } from '@/core/sudoku/types'
import type { NewSudokuVariant, PuzzleRules } from '@/core/sudoku/rules/types'
import { isDigit } from '@/core/sudoku/types'
import type { WorkBudget } from '@/core/sudoku/budget'
import { countSolutions } from '@/core/sudoku/search/exact'
import { VARIANT_TEMPLATES } from '@/core/sudoku/examples/variants'
import type { VariantTemplate } from '@/core/sudoku/examples/variants'
import { shuffle } from '@/core/sudoku/random'
import { constructUnitTerminal } from '@/core/sudoku/generation/terminalConstruction'

export type SpatialSymmetry = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

export function transformVariantTemplate(
  template: VariantTemplate,
  transform: { symmetry: SpatialSymmetry; digitMap?: readonly Digit[]; complement?: boolean },
): VariantTemplate {
  const kind = template.rules.kind
  if (kind === 'classic') {
    throw new TypeError('Classic uses its own terminal construction')
  }

  const strategy = VARIANT_GENERATION_STRATEGIES[kind]

  if (transform.digitMap && !strategy.allowsDigitMap) {
    throw new TypeError('Digit maps do not preserve arithmetic or order clues')
  }

  if (transform.complement && !strategy.allowsComplement) {
    throw new TypeError('Complement does not preserve arrow sums')
  }

  if (
    transform.digitMap &&
    (transform.digitMap.length !== 9 ||
      new Set(transform.digitMap).size !== 9 ||
      !transform.digitMap.every(isDigit))
  ) {
    throw new TypeError('Digit map must be a bijection')
  }

  function cellMap(cell: number): number {
    let row = Math.floor(cell / 9)
    let column = cell % 9
    if (transform.symmetry >= 4) {
      column = 8 - column
    }

    for (let turn = 0; turn < transform.symmetry % 4; turn++) {
      ;[row, column] = [column, 8 - row]
    }

    return row * 9 + column
  }

  function boardMap(board: Board): Board {
    const result: CellValue[] = Array(81).fill(0)
    board.forEach((value, cell) => {
      if (value === 0) {
        return
      }

      let digit = transform.digitMap ? transform.digitMap[value - 1] : value
      if (transform.complement) {
        const complemented = 10 - digit
        if (!isDigit(complemented)) {
          throw new TypeError('Invalid complement')
        }

        digit = complemented
      }

      result[cellMap(cell)] = digit
    })

    return result
  }

  const rules = transformVariantRules(template.rules, cellMap, transform.complement ?? false)

  return {
    rules,
    givens: boardMap(template.givens),
    solution: boardMap(template.solution),
    difficulty: template.difficulty,
  }
}

export function variantRulesMatter(
  template: VariantTemplate,
  budget: WorkBudget,
): { status: 'complete'; matters: boolean } | { status: 'budget-exhausted' } {
  if (template.rules.kind === 'jigsaw' && !isComplete(template.solution)) {
    return { status: 'complete', matters: true }
  }

  const result = countSolutions(template.givens, {
    maxSolutions: 2,
    nodeBudget: budget.limit - budget.used,
    context: CLASSIC_CONTEXT,
    workBudget: budget,
  })
  if (result.status === 'budget-exhausted') {
    return { status: 'budget-exhausted' }
  }

  return { status: 'complete', matters: result.count !== 1 }
}

const SYMMETRIES: readonly SpatialSymmetry[] = [0, 1, 2, 3, 4, 5, 6, 7]

function freshGeometryInput(rules: PuzzleRules): PuzzleRules {
  if (rules.kind === 'thermo') {
    return { kind: 'thermo', paths: [] }
  }
  if (rules.kind === 'arrow') {
    return { kind: 'arrow', arrows: [] }
  }

  return rules
}

function seededTransform(template: VariantTemplate, random: () => number): VariantTemplate {
  const symmetry = SYMMETRIES[Math.floor(random() * SYMMETRIES.length)]
  if (template.rules.kind === 'classic') {
    throw new TypeError('Classic uses its own terminal construction')
  }

  const strategy = VARIANT_GENERATION_STRATEGIES[template.rules.kind]

  // Seed identity includes geometry calls and Arrow skipping unsupported complement draws.
  if (strategy.allowsDigitMap) {
    const digits: readonly Digit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]

    return transformVariantTemplate(template, { symmetry, digitMap: shuffle(digits, random) })
  }

  return transformVariantTemplate(template, {
    symmetry,
    complement: strategy.allowsComplement && random() < 0.5,
  })
}

/** One terminal/geometry attempt. The scheduler charges its layout slot before calling. */
export function constructVariantLayout(
  variant: NewSudokuVariant,
  difficulty: Difficulty,
  random: LayoutRandomStreams,
  budget: WorkBudget,
): LayoutConstructionResult<NewSudokuVariant> {
  const examples = VARIANT_TEMPLATES[variant][difficulty]
  if (!examples.length) {
    return { status: 'failed', reason: 'No geometry example for this type and difficulty' }
  }

  const base = seededTransform(
    examples[Math.floor(random.geometry() * examples.length)],
    random.geometry,
  )
  let terminalContext = CLASSIC_CONTEXT
  if (base.rules.kind === 'diagonal' || base.rules.kind === 'jigsaw') {
    const prepared = prepareRuleContext(base.rules, budget)
    if (prepared.status !== 'ready') {
      return prepared
    }

    terminalContext = prepared.context
  }

  const terminal = constructUnitTerminal(terminalContext, random.terminal, budget)
  if (terminal.status !== 'ready') {
    return terminal
  }
  // Arithmetic clues from examples describe another solution; rebuild them for this terminal.
  const rules = createVariantGeometry(
    freshGeometryInput(base.rules),
    terminal.solution,
    random.geometry,
    budget,
  )
  if (!rules) {
    return budget.used >= budget.limit
      ? { status: 'budget-exhausted' }
      : { status: 'attempt-exhausted' }
  }

  const parsed = parseRules(rules)
  if (!parsed.valid || parsed.value.kind === 'classic' || parsed.value.kind !== variant) {
    return { status: 'attempt-exhausted' }
  }
  if (parsed.value.kind === 'jigsaw' && !irregularRegions(parsed.value)) {
    return { status: 'attempt-exhausted' }
  }

  return { status: 'ready', terminal: terminal.solution, rules: parsed.value }
}
