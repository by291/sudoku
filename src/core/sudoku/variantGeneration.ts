import type { GenerationMetrics } from '@/core/sudoku/generation'
import {
  VARIANT_GENERATION_STRATEGIES,
  createVariantGeometry,
  transformVariantRules,
} from '@/core/sudoku/generationStrategies'
import { irregularRegions } from '@/core/sudoku/variants/jigsaw'
import { isComplete } from '@/core/sudoku/board'
import { CLASSIC_CONTEXT, compileRules, parseRules } from '@/core/sudoku/rules'
import type { Board, CellValue, Digit } from '@/core/sudoku/types'
import type { NewSudokuVariant } from '@/core/sudoku/rules'
import { isDigit } from '@/core/sudoku/types'
import type { WorkBudget } from '@/core/sudoku/budget'
import { countSolutions } from '@/core/sudoku/search'
import { VARIANT_TEMPLATES } from '@/core/sudoku/variantTemplates'
import type { VariantTemplate } from '@/core/sudoku/variantTemplates'
import { createWorkBudget } from '@/core/sudoku/budget'
import { assessPuzzleWithBudget, createAssessmentInput } from '@/core/sudoku/rating'
import { seededRandom, shuffle } from '@/core/sudoku/random'
import { constructUnitTerminal } from '@/core/sudoku/terminalConstruction'
import type {
  GenerationInput,
  GenerationLimits,
  GenerationAttemptResult,
  Puzzle,
} from '@/core/sudoku/generation'

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
const CELL_INDICES = Array.from({ length: 81 }, (_, cell) => cell)

function freshGeometryInput(rules: Puzzle['rules']): Puzzle['rules'] {
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

export function generateVariantPuzzle(
  input: Extract<GenerationInput, { variant: NewSudokuVariant }>,
  limits: GenerationLimits,
  metrics: GenerationMetrics,
): GenerationAttemptResult {
  const random = seededRandom(
    `${input.puzzleVersion}:${input.variant}:${input.difficulty}:${input.seed}`,
  )
  const templates = VARIANT_TEMPLATES[input.variant][input.difficulty]
  if (!templates.length) {
    return { status: 'failed', reason: 'No verified fallback for this type and difficulty' }
  }

  const makePuzzle = (template: VariantTemplate): Puzzle => ({
    ...template,
    seed: input.seed,
    puzzleVersion: input.puzzleVersion,
  })
  // Geometry, uniqueness, fresh assessment policies, and necessity share work across every layout.
  const generationBudget = createWorkBudget(limits.maxWork)
  let fallbackBudget: WorkBudget | null = null
  try {
    for (
      let layout = 0;
      layout < limits.maxLayouts && generationBudget.used < generationBudget.limit;
      layout++
    ) {
      metrics.layouts++
      const base = seededTransform(templates[Math.floor(random() * templates.length)], random)
      const terminalContext =
        base.rules.kind === 'diagonal' || base.rules.kind === 'jigsaw'
          ? compileRules(base.rules)
          : CLASSIC_CONTEXT
      const terminal = constructUnitTerminal(terminalContext, random, generationBudget)
      if (terminal.status === 'budget-exhausted') {
        break
      }
      if (terminal.status === 'failed') {
        return terminal
      }
      // Authored arithmetic paths belong to the fallback solution. Rebuild their geometry
      // from scratch for the new terminal instead of retaining incompatible clue values.
      const rules = createVariantGeometry(
        freshGeometryInput(base.rules),
        terminal.solution,
        random,
        generationBudget,
      )
      if (!rules || !parseRules(rules).valid) {
        continue
      }

      const context = compileRules(rules)
      if (
        !isComplete(terminal.solution, context) ||
        (rules.kind === 'jigsaw' && !irregularRegions(rules))
      ) {
        continue
      }

      const givens = [...terminal.solution]

      for (const cell of shuffle(CELL_INDICES, random)) {
        const previous = givens[cell]
        givens[cell] = 0
        const unique = countSolutions(givens, {
          maxSolutions: 2,
          nodeBudget: generationBudget.limit - generationBudget.used,
          context,
          workBudget: generationBudget,
        })
        if (unique.status === 'budget-exhausted') {
          givens[cell] = previous
          break
        }

        if (unique.count === 0) {
          return { status: 'failed', reason: 'Constructed variant lost its known solution' }
        }

        if (unique.count !== 1) {
          givens[cell] = previous
          continue
        }

        const rating = assessPuzzleWithBudget(
          createAssessmentInput(givens, rules, {
            maxSteps: limits.maxSteps,
            maxWork: generationBudget.limit,
          }),
          generationBudget,
        )
        if (rating.status === 'budget-exhausted') {
          givens[cell] = previous
          break
        }

        if (rating.status === 'invalid') {
          return { status: 'failed', reason: rating.issues.join('; ') }
        }
        if (rating.status !== 'rated') {
          givens[cell] = previous
          continue
        }

        if (rating.summary.difficulty !== input.difficulty) {
          continue
        }

        const candidate: VariantTemplate = {
          rules,
          solution: terminal.solution,
          givens: [...givens],
          difficulty: rating.summary.difficulty,
        }
        const necessity = variantRulesMatter(candidate, generationBudget)
        if (necessity.status === 'budget-exhausted') {
          break
        }

        if (necessity.matters) {
          return {
            status: 'ready',
            source: 'generated',
            puzzle: makePuzzle(candidate),
            assessment: rating.summary,
          }
        }
      }
    }

    const fallback = seededTransform(templates[Math.floor(random() * templates.length)], random)
    fallbackBudget = createWorkBudget(limits.fallbackWork)
    const context = compileRules(fallback.rules)
    const unique = countSolutions(fallback.givens, {
      maxSolutions: 2,
      nodeBudget: fallbackBudget.limit,
      context,
      workBudget: fallbackBudget,
    })
    if (unique.status === 'budget-exhausted') {
      return { status: 'budget-exhausted', stage: 'fallback-validation' }
    }

    const rating = assessPuzzleWithBudget(
      createAssessmentInput(fallback.givens, fallback.rules, {
        maxSteps: limits.maxSteps,
        maxWork: fallbackBudget.limit,
      }),
      fallbackBudget,
    )
    if (rating.status === 'budget-exhausted') {
      return { status: 'budget-exhausted', stage: 'fallback-validation' }
    }

    const necessity = variantRulesMatter(fallback, fallbackBudget)
    if (necessity.status === 'budget-exhausted') {
      return { status: 'budget-exhausted', stage: 'fallback-validation' }
    }

    if (
      unique.count !== 1 ||
      rating.status !== 'rated' ||
      rating.summary.difficulty !== input.difficulty ||
      !necessity.matters ||
      !isComplete(fallback.solution, context)
    ) {
      return { status: 'failed', reason: 'Fallback validation failed' }
    }

    return {
      status: 'ready',
      source: 'fallback',
      puzzle: makePuzzle(fallback),
      assessment: rating.summary,
    }
  } finally {
    metrics.constructionWork = generationBudget.used
    metrics.fallbackWork = fallbackBudget?.used ?? 0
  }
}
