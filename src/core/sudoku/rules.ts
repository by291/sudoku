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

function relationships(groups: readonly (readonly number[])[]): readonly (readonly number[])[] {
  return Array.from({ length: BOARD_SIZE }, (_, cell) =>
    [...new Set(groups.filter((group) => group.includes(cell)).flat())]
      .filter((peer) => peer !== cell)
      .sort((a, b) => a - b),
  )
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

export function compileRules(rules: PuzzleRules): RuleContext {
  const parsed = parseRules(rules)

  if (!parsed.valid) {
    throw new TypeError(parsed.issues.join('; '))
  }

  const { units, constraints, duplicateGroups } = compileVariantRules(rules)

  return {
    rules,
    units,
    constraints,
    duplicatePeers: relationships(duplicateGroups),
    relatedCells: relationships([...duplicateGroups, ...constraints.map(constraintCells)]),
  }
}

export const CLASSIC_CONTEXT = compileRules(CLASSIC_RULES)
