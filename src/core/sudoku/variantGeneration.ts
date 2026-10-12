import { isComplete } from '@/core/sudoku/board'
import { CLASSIC_CONTEXT, cellsTouch, compileRules, parseRules } from '@/core/sudoku/rules'
import type { PuzzleRules } from '@/core/sudoku/rules'
import type { Board, CellValue, Digit } from '@/core/sudoku/types'
import { isDigit } from '@/core/sudoku/types'
import type { WorkBudget } from '@/core/sudoku/budget'
import { countSolutions } from '@/core/sudoku/search'
import { VARIANT_TEMPLATES } from '@/core/sudoku/variantTemplates'
import type { VariantTemplate } from '@/core/sudoku/variantTemplates'
import { createWorkBudget, consumeWork } from '@/core/sudoku/budget'
import { rateVariantDifficulty } from '@/core/sudoku/logic'
import { seededRandom, shuffle } from '@/core/sudoku/random'
import type {
  GenerationInput,
  GenerationLimits,
  GenerationResult,
  Puzzle,
} from '@/core/sudoku/generation'

export type SpatialSymmetry = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7
export function transformVariantTemplate(
  template: VariantTemplate,
  transform: { symmetry: SpatialSymmetry; digitMap?: readonly Digit[]; complement?: boolean },
): VariantTemplate {
  const kind = template.rules.kind
  if (kind === 'classic') throw new TypeError('Classic uses its original transformation stream')
  if (transform.digitMap && kind !== 'diagonal' && kind !== 'jigsaw')
    throw new TypeError('Digit maps do not preserve arithmetic or order clues')
  if (transform.complement && kind === 'arrow')
    throw new TypeError('Complement does not preserve arrow sums')
  if (
    transform.digitMap &&
    (transform.digitMap.length !== 9 ||
      new Set(transform.digitMap).size !== 9 ||
      !transform.digitMap.every(isDigit))
  )
    throw new TypeError('Digit map must be a bijection')
  function cellMap(cell: number): number {
    let row = Math.floor(cell / 9),
      column = cell % 9
    if (transform.symmetry >= 4) column = 8 - column
    for (let turn = 0; turn < transform.symmetry % 4; turn++) [row, column] = [column, 8 - row]
    return row * 9 + column
  }
  function boardMap(board: Board): Board {
    const result: CellValue[] = Array(81).fill(0)
    board.forEach((value, cell) => {
      if (value === 0) return
      let digit = transform.digitMap ? transform.digitMap[value - 1] : value
      if (transform.complement) {
        const complemented = 10 - digit
        if (!isDigit(complemented)) throw new TypeError('Invalid complement')
        digit = complemented
      }
      result[cellMap(cell)] = digit
    })
    return result
  }
  let rules: PuzzleRules = template.rules
  if (rules.kind === 'jigsaw')
    rules = { kind: 'jigsaw', regions: rules.regions.map((region) => region.map(cellMap)) }
  else if (rules.kind === 'killer')
    rules = {
      kind: 'killer',
      cages: rules.cages.map((cage) => ({
        cells: cage.cells.map(cellMap),
        sum: transform.complement ? cage.cells.length * 10 - cage.sum : cage.sum,
      })),
    }
  else if (rules.kind === 'thermo')
    rules = {
      kind: 'thermo',
      paths: rules.paths.map((path) =>
        transform.complement ? path.map(cellMap).reverse() : path.map(cellMap),
      ),
    }
  else if (rules.kind === 'arrow')
    rules = {
      kind: 'arrow',
      arrows: rules.arrows.map((arrow) => ({
        circle: cellMap(arrow.circle),
        shaft: arrow.shaft.map(cellMap),
      })),
    }
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
  if (template.rules.kind === 'jigsaw' && !isComplete(template.solution))
    return { status: 'complete', matters: true }
  const result = countSolutions(template.givens, {
    maxSolutions: 2,
    nodeBudget: budget.limit - budget.used,
    context: CLASSIC_CONTEXT,
    workBudget: budget,
  })
  if (result.status === 'budget-exhausted') return { status: 'budget-exhausted' }
  return { status: 'complete', matters: result.count !== 1 }
}

const SYMMETRIES: readonly SpatialSymmetry[] = [0, 1, 2, 3, 4, 5, 6, 7]
const CELL_INDICES = Array.from({ length: 81 }, (_, cell) => cell)
function seededTransform(template: VariantTemplate, random: () => number): VariantTemplate {
  const symmetry = SYMMETRIES[Math.floor(random() * SYMMETRIES.length)]
  if (template.rules.kind === 'diagonal' || template.rules.kind === 'jigsaw') {
    const digits: readonly Digit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    return transformVariantTemplate(template, { symmetry, digitMap: shuffle(digits, random) })
  }
  return transformVariantTemplate(template, {
    symmetry,
    complement: template.rules.kind !== 'arrow' && random() < 0.5,
  })
}
function irregularRegions(rules: PuzzleRules): boolean {
  return (
    rules.kind === 'jigsaw' &&
    rules.regions.some((region) => {
      const rows = region.map((cell) => Math.floor(cell / 9)),
        columns = region.map((cell) => cell % 9)
      return (
        (Math.max(...rows) - Math.min(...rows) + 1) *
          (Math.max(...columns) - Math.min(...columns) + 1) !==
        region.length
      )
    })
  )
}
function generateGeometry(
  base: VariantTemplate,
  random: () => number,
  budget: WorkBudget,
): PuzzleRules | null {
  const rules = base.rules,
    solution = base.solution
  if (rules.kind === 'diagonal') return rules
  if (rules.kind === 'jigsaw') {
    let regions = rules.regions.map((region) => [...region])
    for (let attempt = 0; attempt < 20; attempt++) {
      if (!consumeWork(budget)) return null
      const first = Math.floor(random() * 81)
      const second = Math.floor(random() * 81)
      if (first === second || solution[first] !== solution[second]) continue
      const firstRegion = regions.findIndex((region) => region.includes(first))
      const secondRegion = regions.findIndex((region) => region.includes(second))
      if (firstRegion === secondRegion) continue
      const candidate = regions.map((region, index) =>
        index === firstRegion
          ? region.map((cell) => (cell === first ? second : cell))
          : index === secondRegion
            ? region.map((cell) => (cell === second ? first : cell))
            : [...region],
      )
      const proposed: PuzzleRules = { kind: 'jigsaw', regions: candidate }
      if (parseRules(proposed).valid && irregularRegions(proposed)) regions = candidate
    }
    return { kind: 'jigsaw', regions }
  }
  if (rules.kind === 'killer') {
    const remaining = new Set(shuffle(CELL_INDICES, random))
    const cages: { cells: number[]; sum: number }[] = []
    while (remaining.size) {
      if (!consumeWork(budget)) return null
      const first = remaining.values().next().value
      if (first === undefined) break
      const cells = [first]
      remaining.delete(first)
      const size = 2 + Math.floor(random() * 3)
      while (cells.length < size) {
        const choices = [...remaining].filter(
          (cell) =>
            cells.some((other) => cellsTouch(cell, other, false)) &&
            !cells.some((other) => solution[other] === solution[cell]),
        )
        if (!choices.length) break
        const next = choices[Math.floor(random() * choices.length)]
        cells.push(next)
        remaining.delete(next)
      }
      cages.push({ cells, sum: cells.reduce((sum, cell) => sum + solution[cell], 0) })
    }
    return { kind: 'killer', cages }
  }
  if (rules.kind === 'thermo') {
    const paths = rules.paths.map((path) => [...path])
    for (let attempt = 0; attempt < 8; attempt++) {
      const path = [Math.floor(random() * 81)]
      while (path.length < 5) {
        if (!consumeWork(budget)) return null
        const end = path[path.length - 1]
        const choices = CELL_INDICES.filter(
          (cell) =>
            !path.includes(cell) && cellsTouch(end, cell, true) && solution[cell] > solution[end],
        )
        if (!choices.length) break
        path.push(choices[Math.floor(random() * choices.length)])
      }
      if (path.length >= 2 && !paths.some((other) => other.join(',') === path.join(',')))
        paths.push(path)
    }
    return { kind: 'thermo', paths }
  }
  if (rules.kind === 'arrow') {
    const arrows = [...rules.arrows]
    for (let attempt = 0; attempt < 12 && arrows.length < 4; attempt++) {
      const circle = Math.floor(random() * 81)
      if (solution[circle] < 3) continue
      function shaft(path: readonly number[], total: number): readonly number[] | null {
        if (!consumeWork(budget)) return null
        if (total === solution[circle]) return path.length >= 2 ? path : null
        if (path.length >= 5) return null
        const end = path.length ? path[path.length - 1] : circle
        const choices = shuffle(
          CELL_INDICES.filter(
            (cell) =>
              cell !== circle &&
              !path.includes(cell) &&
              cellsTouch(end, cell, true) &&
              total + solution[cell] <= solution[circle],
          ),
          random,
        )
        for (const cell of choices) {
          const result = shaft([...path, cell], total + solution[cell])
          if (result) return result
          if (budget.used >= budget.limit) return null
        }
        return null
      }
      const path = shaft([], 0)
      if (budget.used >= budget.limit) return null
      if (path) arrows.push({ circle, shaft: path })
    }
    return { kind: 'arrow', arrows }
  }
  return null
}
export function generateVariantPuzzle(
  input: Extract<GenerationInput, { puzzleVersion: 'sudoku-variants-v1' }>,
  limits: GenerationLimits,
): GenerationResult {
  const random = seededRandom(
    `${input.puzzleVersion}:${input.variant}:${input.difficulty}:${input.seed}`,
  )
  const templates = VARIANT_TEMPLATES[input.variant][input.difficulty]
  if (!templates.length)
    return { status: 'failed', reason: 'No verified fallback for this type and difficulty' }
  const makePuzzle = (template: VariantTemplate): Puzzle => ({
    ...template,
    seed: input.seed,
    puzzleVersion: input.puzzleVersion,
  })
  const generationBudget = createWorkBudget(limits.searchNodes)
  for (
    let layout = 0;
    layout < limits.maxLayouts && generationBudget.used < generationBudget.limit;
    layout++
  ) {
    const base = seededTransform(templates[Math.floor(random() * templates.length)], random)
    const rules = generateGeometry(base, random, generationBudget)
    if (!rules || !parseRules(rules).valid) continue
    const context = compileRules(rules)
    if (
      !isComplete(base.solution, context) ||
      (rules.kind === 'jigsaw' && !irregularRegions(rules))
    )
      continue
    const givens = [...base.solution]
    for (const cell of shuffle(CELL_INDICES, random)) {
      const previous = givens[cell]
      givens[cell] = 0
      const unique = countSolutions(givens, {
        maxSolutions: 2,
        nodeBudget: generationBudget.limit - generationBudget.used,
        context,
        workBudget: generationBudget,
      })
      if (unique.status === 'budget-exhausted') break
      if (unique.count !== 1) {
        givens[cell] = previous
        continue
      }
      const rating = rateVariantDifficulty(givens, context, limits.logicalSteps, generationBudget)
      if (rating.status === 'budget-exhausted') break
      if (!rating.difficulty) {
        givens[cell] = previous
        continue
      }
      if (rating.difficulty !== input.difficulty) continue
      const candidate: VariantTemplate = {
        rules,
        solution: base.solution,
        givens: [...givens],
        difficulty: rating.difficulty,
      }
      const necessity = variantRulesMatter(candidate, generationBudget)
      if (necessity.status === 'budget-exhausted') break
      if (necessity.matters)
        return { status: 'ready', source: 'generated', puzzle: makePuzzle(candidate) }
    }
  }
  const fallback = seededTransform(templates[Math.floor(random() * templates.length)], random)
  const fallbackBudget = createWorkBudget(limits.fallbackNodes)
  const context = compileRules(fallback.rules)
  const unique = countSolutions(fallback.givens, {
    maxSolutions: 2,
    nodeBudget: fallbackBudget.limit,
    context,
    workBudget: fallbackBudget,
  })
  if (unique.status === 'budget-exhausted')
    return { status: 'budget-exhausted', stage: 'fallback-validation' }
  const rating = rateVariantDifficulty(
    fallback.givens,
    context,
    limits.logicalSteps,
    fallbackBudget,
  )
  if (rating.status === 'budget-exhausted')
    return { status: 'budget-exhausted', stage: 'fallback-validation' }
  const necessity = variantRulesMatter(fallback, fallbackBudget)
  if (necessity.status === 'budget-exhausted')
    return { status: 'budget-exhausted', stage: 'fallback-validation' }
  if (
    unique.count !== 1 ||
    rating.difficulty !== input.difficulty ||
    !necessity.matters ||
    !isComplete(fallback.solution, context)
  )
    return { status: 'failed', reason: 'Fallback validation failed' }
  return { status: 'ready', source: 'fallback', puzzle: makePuzzle(fallback) }
}
