import { consumeWork, withWorkStage } from '@/core/sudoku/budget'
import type { WorkBudget } from '@/core/sudoku/budget'
import { BOARD_SIZE, isRecord } from '@/core/sudoku/types'
import type { Board, ParseResult } from '@/core/sudoku/types'
import { SUDOKU_VARIANTS } from '@/core/sudoku/ruleTypes'
import type {
  PuzzleRules,
  SudokuVariant,
  RuleConstraint,
  RuleContext,
} from '@/core/sudoku/ruleTypes'
import { invalidRules } from '@/core/sudoku/ruleTopology'
import { VARIANT_RULE_DEFINITIONS, compileVariantRules } from '@/core/sudoku/variantRegistry'

export { SUDOKU_VARIANTS } from '@/core/sudoku/ruleTypes'
export type {
  SudokuVariant,
  NewSudokuVariant,
  Cage,
  Arrow,
  PuzzleRules,
  Unit,
  SudokuUnit,
  RuleConstraint,
  RuleContext,
  RulesFor,
} from '@/core/sudoku/ruleTypes'
export { cellsTouch } from '@/core/sudoku/ruleTopology'

export const CLASSIC_RULES: PuzzleRules = { kind: 'classic' }

export function isSudokuVariant(value: unknown): value is SudokuVariant {
  return SUDOKU_VARIANTS.some((variant) => variant === value)
}

export function parseRules(value: unknown): ParseResult<PuzzleRules> {
  if (!isRecord(value) || !isSudokuVariant(value.kind)) {
    return invalidRules('Unknown Sudoku rule type')
  }

  return VARIANT_RULE_DEFINITIONS[value.kind].parse(value)
}

function memberships(
  groups: readonly (readonly number[])[],
  budget?: WorkBudget,
): readonly (readonly number[])[] | null {
  const result = Array.from({ length: BOARD_SIZE }, (): number[] => [])
  for (const [index, cells] of groups.entries()) {
    for (const cell of cells) {
      if (budget && !consumeWork(budget)) {
        return null
      }
      result[cell].push(index)
    }
  }

  return Object.freeze(result.map((cells) => Object.freeze(cells)))
}

function relationships(
  groups: readonly (readonly number[])[],
  budget?: WorkBudget,
): readonly (readonly number[])[] | null {
  const peers = Array.from({ length: BOARD_SIZE }, () => new Set<number>())
  for (const cells of groups) {
    for (const cell of cells) {
      for (const peer of cells) {
        if (budget && !consumeWork(budget)) {
          return null
        }
        if (peer !== cell) {
          peers[cell].add(peer)
        }
      }
    }
  }

  return Object.freeze(peers.map((cells) => Object.freeze([...cells].sort((a, b) => a - b))))
}

// Only freshly parsed snapshots enter this owner; freezing cannot affect caller arrays.
function freezeRules(rules: PuzzleRules): PuzzleRules {
  switch (rules.kind) {
    case 'jigsaw':
      rules.regions.forEach(Object.freeze)
      Object.freeze(rules.regions)
      break
    case 'killer':
      rules.cages.forEach((cage) => {
        Object.freeze(cage.cells)
        Object.freeze(cage)
      })
      Object.freeze(rules.cages)
      break
    case 'thermo':
      rules.paths.forEach(Object.freeze)
      Object.freeze(rules.paths)
      break
    case 'arrow':
      rules.arrows.forEach((arrow) => {
        Object.freeze(arrow.shaft)
        Object.freeze(arrow)
      })
      Object.freeze(rules.arrows)
      break
  }

  return Object.freeze(rules)
}

export function constraintCells(constraint: RuleConstraint): readonly number[] {
  return constraint.kind === 'arrow' ? [constraint.circle, ...constraint.shaft] : constraint.cells
}

export function satisfiesConstraint(board: Board, constraint: RuleConstraint): boolean {
  if (constraint.kind === 'thermo') {
    return constraint.cells
      .slice(1)
      .every((cell, index) => board[cell] > board[constraint.cells[index]])
  }

  if (constraint.kind === 'arrow') {
    return constraint.shaft.reduce((sum, cell) => sum + board[cell], 0) === board[constraint.circle]
  }

  const values = constraint.cells.map((cell) => board[cell])

  return (
    new Set(values).size === values.length &&
    values.reduce<number>((sum, digit) => sum + digit, 0) === constraint.sum
  )
}

function buildRuleContext(rules: PuzzleRules, budget?: WorkBudget): RuleContext | null {
  const parsed = parseRules(rules)
  if (!parsed.valid) {
    throw new TypeError(parsed.issues.join('; '))
  }

  if (budget && !consumeWork(budget)) {
    return null
  }
  const ownedRules = freezeRules(parsed.value)
  const {
    units: sourceUnits,
    constraints: sourceConstraints,
    duplicateGroups,
  } = compileVariantRules(ownedRules)
  const units = Object.freeze(
    sourceUnits.map((unit) => Object.freeze({ ...unit, cells: Object.freeze([...unit.cells]) })),
  )
  const constraints = Object.freeze(
    sourceConstraints.map((constraint) => Object.freeze(constraint)),
  )
  const cellUnits = memberships(
    units.map((unit) => unit.cells),
    budget,
  )
  const cellConstraints = memberships(constraints.map(constraintCells), budget)
  if (!cellUnits || !cellConstraints) {
    return null
  }
  const duplicatePeers = relationships(duplicateGroups, budget)
  const relatedCells = relationships(
    [...duplicateGroups, ...constraints.map(constraintCells)],
    budget,
  )
  if (!duplicatePeers || !relatedCells) {
    return null
  }

  return Object.freeze({
    rules: ownedRules,
    units,
    constraints,
    cellUnits,
    cellConstraints,
    duplicatePeers,
    relatedCells,
  })
}

export function compileRules(rules: PuzzleRules): RuleContext {
  const context = buildRuleContext(rules)
  if (!context) {
    throw new Error('Unbounded rule compilation unexpectedly exhausted')
  }

  return context
}

/** Preparation owns its geometry; exhaustion never exposes a partial topology. */
export function prepareRuleContext(
  rules: PuzzleRules,
  budget: WorkBudget,
): { status: 'ready'; context: RuleContext } | { status: 'budget-exhausted' } {
  return withWorkStage(budget, 'preparation', () => {
    // Classic geometry is static. The request only inspects the kind, not its constant topology.
    if (rules.kind === 'classic') {
      return consumeWork(budget)
        ? { status: 'ready', context: CLASSIC_CONTEXT }
        : { status: 'budget-exhausted' }
    }
    const context = buildRuleContext(rules, budget)

    return context ? { status: 'ready', context } : { status: 'budget-exhausted' }
  })
}

export const CLASSIC_CONTEXT = compileRules(CLASSIC_RULES)
