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
import type { RuleContext } from '@/core/sudoku/rules'
import type { DifficultyAssessment } from '@/core/sudoku/rating'
import { isDigit } from '@/core/sudoku/types'
import type { WorkBudget } from '@/core/sudoku/budget'
import { countSolutions } from '@/core/sudoku/search'
import { VARIANT_TEMPLATES } from '@/core/sudoku/variantTemplates'
import type { VariantTemplate } from '@/core/sudoku/variantTemplates'
import { createWorkBudget } from '@/core/sudoku/budget'
import { assessPuzzleWithBudget, createAssessmentInput } from '@/core/sudoku/rating'
import { seededRandom, shuffle } from '@/core/sudoku/random'
import { analyzeLogic } from '@/core/sudoku/logic'
import { RATING_POLICIES } from '@/core/sudoku/ratingPolicies'
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

type RemovalCheck =
  | { status: 'matching-tier'; assessment: DifficultyAssessment }
  | { status: 'rejected'; retainRemoval: boolean }
  | { status: 'budget-exhausted' }
  | { status: 'failed'; reason: string }

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
  const geometryExamples = VARIANT_TEMPLATES[input.variant][input.difficulty]
  if (!geometryExamples.length) {
    return { status: 'failed', reason: 'No geometry example for this type and difficulty' }
  }

  const makePuzzle = (template: VariantTemplate): Puzzle => ({
    ...template,
    seed: input.seed,
    puzzleVersion: input.puzzleVersion,
  })
  // Geometry, uniqueness, assessment and necessity share work across every layout.
  const generationBudget = createWorkBudget(limits.maxWork)

  function assessRemoval(board: Board, rules: Puzzle['rules']): RemovalCheck {
    const rating = assessPuzzleWithBudget(
      createAssessmentInput(board, rules, {
        maxSteps: limits.maxSteps,
        maxWork: generationBudget.limit,
      }),
      generationBudget,
    )
    if (rating.status === 'budget-exhausted') {
      return rating
    }
    if (rating.status === 'invalid') {
      return { status: 'failed', reason: rating.issues.join('; ') }
    }
    if (rating.status !== 'rated') {
      return { status: 'rejected', retainRemoval: false }
    }
    if (rating.summary.difficulty !== input.difficulty) {
      return { status: 'rejected', retainRemoval: true }
    }
    return { status: 'matching-tier', assessment: rating.summary }
  }

  function checkRemoval(board: Board, context: RuleContext): RemovalCheck {
    const ratingFirst = input.variant === 'killer' && input.difficulty === 'hard'
    if (ratingFirst) {
      // These givens and cages come from the same verified terminal. An Easy proof can
      // reject a trial cheaply; accepted Hard candidates still require full assessment.
      const easy = analyzeLogic(board, RATING_POLICIES.killer.easy, limits.maxSteps, {
        context,
        workBudget: generationBudget,
      })
      if (easy.status === 'budget-exhausted') {
        return { status: 'budget-exhausted' }
      }
      if (easy.status === 'solved') {
        return { status: 'rejected', retainRemoval: true }
      }
    }
    const earlierRating = ratingFirst ? assessRemoval(board, context.rules) : null
    if (earlierRating !== null && earlierRating.status !== 'matching-tier') {
      // Different-tier removals are tentative construction states. Every delivered candidate
      // still passes the independent exact-count gate below; rating never replaces uniqueness.
      return earlierRating
    }

    const unique = countSolutions(board, {
      maxSolutions: 2,
      nodeBudget: generationBudget.limit - generationBudget.used,
      context,
      workBudget: generationBudget,
    })
    if (unique.status === 'budget-exhausted') {
      return unique
    }
    if (unique.count === 0) {
      return { status: 'failed', reason: 'Constructed variant lost its known solution' }
    }
    if (unique.count !== 1) {
      return { status: 'rejected', retainRemoval: false }
    }
    return earlierRating ?? assessRemoval(board, context.rules)
  }

  try {
    for (
      let layout = 0;
      layout < limits.maxLayouts && generationBudget.used < generationBudget.limit;
      layout++
    ) {
      metrics.layouts++
      const base = seededTransform(
        geometryExamples[Math.floor(random() * geometryExamples.length)],
        random,
      )
      const terminalContext =
        base.rules.kind === 'diagonal' || base.rules.kind === 'jigsaw'
          ? compileRules(base.rules)
          : CLASSIC_CONTEXT
      const terminal = constructUnitTerminal(terminalContext, random, generationBudget)
      if (terminal.status === 'budget-exhausted') {
        break
      }
      if (terminal.status === 'attempt-exhausted') {
        continue
      }
      if (terminal.status === 'failed') {
        return terminal
      }
      // Example arithmetic paths belong to a different solution. Rebuild their geometry
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
        const check = checkRemoval(givens, context)
        if (check.status === 'budget-exhausted') {
          givens[cell] = previous
          break
        }
        if (check.status === 'failed') {
          return check
        }
        if (check.status === 'rejected') {
          if (!check.retainRemoval) {
            givens[cell] = previous
          }
          continue
        }
        const candidate: VariantTemplate = {
          rules,
          solution: terminal.solution,
          givens: [...givens],
          difficulty: check.assessment.difficulty,
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
            assessment: check.assessment,
          }
        }
      }
    }

    return { status: 'budget-exhausted', stage: 'construction' }
  } finally {
    metrics.constructionWork = generationBudget.used
  }
}
