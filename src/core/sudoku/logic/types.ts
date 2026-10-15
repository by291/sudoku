import type { Unit, RuleContext } from '@/core/sudoku/rules/types'
import type { Board, Digit, NoteMask, CellValue } from '@/core/sudoku/types'
import type { CageSupportMemo, PreparedConstraintSupport } from '@/core/sudoku/constraints/types'
import type { WorkBudget } from '@/core/sudoku/budget'

export type BasicClassicTechnique =
  'naked-single' | 'hidden-single' | 'locked-candidate' | 'naked-pair' | 'hidden-pair'

export type AdvancedTechnique =
  'naked-triple' | 'hidden-triple' | 'x-wing' | 'swordfish' | 'xy-wing' | 'simple-coloring'

export type ClassicTechnique = BasicClassicTechnique | AdvancedTechnique

type CandidateDomain = { cell: number; mask: NoteMask }

type PatternFacts = {
  cells: readonly number[]
  digits: readonly Digit[]
  domains: readonly CandidateDomain[]
}

export type AdvancedEvidence = PatternFacts &
  (
    | { kind: 'subset'; unit: Unit; hidden: boolean }
    | { kind: 'fish'; bases: readonly Unit[]; covers: readonly Unit[] }
    | { kind: 'wing'; pivot: number; wings: readonly [number, number] }
    | {
        kind: 'coloring'
        mode: 'trap' | 'wrap'
        colors: readonly [readonly number[], readonly number[]]
        links: readonly { unit: Unit; cells: readonly [number, number] }[]
      }
  )

export type Technique =
  | ClassicTechnique
  | 'cage-distinct'
  | 'cage-remainder'
  | 'cage-combination'
  | 'thermo-bound'
  | 'arrow-equation'
  | 'arrow-combination'

type ClueEvidence = { constraintId: string; cells: readonly number[]; digits: readonly Digit[] }

export type RuleEvidence = ClueEvidence &
  (
    | { kind: 'cage'; sum: number; domains: readonly { cell: number; mask: NoteMask }[] }
    | {
        kind: 'thermo'
        path: readonly number[]
        bounds: readonly { cell: number; min: Digit; max: Digit }[]
      }
    | {
        kind: 'arrow'
        circle: number
        shaft: readonly number[]
        domains: readonly { cell: number; mask: NoteMask }[]
      }
  )

export type LogicalState = {
  board: Board
  candidates: readonly NoteMask[]
  context?: RuleContext
  premises?: readonly RuleEvidence[]
  support?: PreparedConstraintSupport
  cageSupportMemo?: CageSupportMemo
}

export type LogicalStep = {
  technique: Technique
  evidence:
    | RuleEvidence
    | AdvancedEvidence
    | {
        kind: 'unit'
        unit: Unit
        cells: readonly number[]
        digits: readonly Digit[]
        premises: readonly RuleEvidence[]
        units?: readonly Unit[]
      }
} & (
  | { kind: 'placement'; cell: number; digit: Digit }
  | { kind: 'elimination'; removals: readonly { cell: number; digit: Digit }[] }
)

export type StepOutcome =
  { status: 'complete'; step: LogicalStep | null } | { status: 'budget-exhausted' }

export type LogicalWorkspace = {
  board: CellValue[]
  candidates: NoteMask[]
  context: RuleContext
  premises: RuleEvidence[]
  support?: PreparedConstraintSupport
  cageSupportMemo: CageSupportMemo
}

export type LogicalOptions = {
  support?: PreparedConstraintSupport
  context: RuleContext
  workBudget: WorkBudget
}

export type LogicResult = {
  board: Board
  steps: readonly LogicalStep[]
} & (
  | { status: 'solved' | 'stalled' }
  | { status: 'budget-exhausted'; cause: 'work-limit' | 'logical-step-limit' }
)
