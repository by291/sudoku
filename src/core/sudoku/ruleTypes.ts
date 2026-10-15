import type { ParseResult } from '@/core/sudoku/types'

export const SUDOKU_VARIANTS = [
  'classic',
  'diagonal',
  'jigsaw',
  'killer',
  'thermo',
  'arrow',
] as const

export type SudokuVariant = (typeof SUDOKU_VARIANTS)[number]

export type NewSudokuVariant = Exclude<SudokuVariant, 'classic'>

export type Cage = { cells: readonly number[]; sum: number }

export type Arrow = { circle: number; shaft: readonly number[] }

export type PuzzleRules =
  | { kind: 'classic' }
  | { kind: 'diagonal' }
  | { kind: 'jigsaw'; regions: readonly (readonly number[])[] }
  | { kind: 'killer'; cages: readonly Cage[] }
  | { kind: 'thermo'; paths: readonly (readonly number[])[] }
  | { kind: 'arrow'; arrows: readonly Arrow[] }

export type Unit = { kind: 'row' | 'column' | 'box' | 'region' | 'diagonal'; index: number }

export type SudokuUnit = Unit & { cells: readonly number[] }

export type RuleConstraint =
  | (Cage & { kind: 'cage'; id: string; index: number })
  | { kind: 'thermo'; id: string; index: number; cells: readonly number[] }
  | (Arrow & { kind: 'arrow'; id: string; index: number })

export type RuleContext = {
  readonly cellUnits: readonly (readonly number[])[]
  readonly cellConstraints: readonly (readonly number[])[]
  rules: PuzzleRules
  units: readonly SudokuUnit[]
  duplicatePeers: readonly (readonly number[])[]
  relatedCells: readonly (readonly number[])[]
  constraints: readonly RuleConstraint[]
}

export type RulesFor<K extends SudokuVariant> = Extract<PuzzleRules, { kind: K }>

export type CompiledVariantRules = {
  units: readonly SudokuUnit[]
  constraints: readonly RuleConstraint[]
  duplicateGroups: readonly (readonly number[])[]
}

export type VariantRuleDefinition<K extends SudokuVariant> = {
  parse(value: unknown): ParseResult<RulesFor<K>>
  compile(rules: RulesFor<K>): CompiledVariantRules
}
