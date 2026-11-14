import type { Board, Digit, NoteMask } from '@/sudoku/contracts'
import type { LogicalStep, RuleEvidence, AdvancedEvidence } from '@/sudoku/contracts'
import type { PuzzleRules, Unit } from '@/sudoku/contracts'
import { copyRules } from '@/sudoku/ruleInput'
import { BOARD_SIZE, BOX_SIZE, UNIT_SIZE } from '@/sudoku/values'
import type { LessonCalculation } from '@/sudoku/contracts'

// Engine symmetry identifiers preserve the authored transfer geometry.
const HALF_TURN_SYMMETRY = 2
const TRANSPOSE_SYMMETRY = 7
const FIRST_SWAPPED_ROW = BOX_SIZE
const SECOND_SWAPPED_ROW = FIRST_SWAPPED_ROW + 1

export type ExerciseAnswer =
  | { kind: 'placement'; expected: { cell: number; digit: Digit } }
  | { kind: 'elimination'; expected: readonly { cell: number; digit: Digit }[] }

export type ExerciseStage = {
  board: Board
  candidates: readonly NoteMask[]
  rules: PuzzleRules
  step: LogicalStep
}
export type LessonExercise = { title: string; stages: readonly ExerciseStage[] }

/** Read the expected placement or eliminations from an authored proof. */
export function stageAnswer(stage: ExerciseStage): ExerciseAnswer {
  const step = stage.step
  return step.kind === 'placement'
    ? { kind: 'placement', expected: { cell: step.cell, digit: step.digit } }
    : { kind: 'elimination', expected: step.removals }
}

/** Each spatial transform is an involution; only Classic permits the within-band row swap. */
export function transformStage(
  stage: ExerciseStage,
  calculation: Pick<LessonCalculation, 'transformRules'>,
  transform: 'transpose' | 'rotate' | 'swap-rows' = 'transpose',
): ExerciseStage {
  if (transform === 'swap-rows' && stage.rules.kind !== 'classic') {
    throw new TypeError('Row permutations must not change variant clue geometry')
  }

  function swapRow(row: number): number {
    switch (row) {
      case FIRST_SWAPPED_ROW:
        return SECOND_SWAPPED_ROW
      case SECOND_SWAPPED_ROW:
        return FIRST_SWAPPED_ROW
      default:
        return row
    }
  }

  // The board can read through the same mapping used to move evidence: it is its own inverse.
  function cellMap(cell: number): number {
    if (transform === 'rotate') {
      return BOARD_SIZE - 1 - cell
    }
    if (transform === 'swap-rows') {
      return swapRow(Math.floor(cell / UNIT_SIZE)) * UNIT_SIZE + (cell % UNIT_SIZE)
    }
    return (cell % UNIT_SIZE) * UNIT_SIZE + Math.floor(cell / UNIT_SIZE)
  }

  const cells = (values: readonly number[]) => values.map(cellMap)

  function unitMap(unit: Unit): Unit {
    if (transform === 'rotate') {
      return {
        kind: unit.kind,
        index:
          unit.kind === 'row' || unit.kind === 'column' || unit.kind === 'box'
            ? UNIT_SIZE - 1 - unit.index
            : unit.index,
      }
    }
    if (transform === 'swap-rows') {
      return { kind: unit.kind, index: unit.kind === 'row' ? swapRow(unit.index) : unit.index }
    }
    if (unit.kind === 'row' || unit.kind === 'column') {
      return { kind: unit.kind === 'row' ? 'column' : 'row', index: unit.index }
    }
    return {
      kind: unit.kind,
      index:
        unit.kind === 'box'
          ? (unit.index % BOX_SIZE) * BOX_SIZE + Math.floor(unit.index / BOX_SIZE)
          : unit.index,
    }
  }

  function clueMap(evidence: RuleEvidence): RuleEvidence {
    const common = { ...evidence, cells: cells(evidence.cells) }
    if (evidence.kind === 'thermo') {
      return {
        ...common,
        kind: 'thermo',
        path: cells(evidence.path),
        bounds: evidence.bounds.map((bound) => ({ ...bound, cell: cellMap(bound.cell) })),
      }
    }

    const domains = evidence.domains.map((domain) => ({ ...domain, cell: cellMap(domain.cell) }))
    if (evidence.kind === 'cage') {
      return {
        ...common,
        kind: 'cage',
        sum: evidence.sum,
        domains,
      }
    }

    return {
      ...common,
      kind: 'arrow',
      circle: cellMap(evidence.circle),
      shaft: cells(evidence.shaft),
      domains,
    }
  }

  function proofMap(evidence: LogicalStep['evidence']): LogicalStep['evidence'] {
    if (evidence.kind === 'unit') {
      return {
        ...evidence,
        unit: unitMap(evidence.unit),
        cells: cells(evidence.cells),
        premises: evidence.premises.map(clueMap),
        ...(evidence.units === undefined ? {} : { units: evidence.units.map(unitMap) }),
      }
    }
    if (evidence.kind === 'cage' || evidence.kind === 'arrow' || evidence.kind === 'thermo') {
      return clueMap(evidence)
    }

    // Advanced evidence uses canonical cell order; path clues keep their direction.
    const common = {
      cells: cells(evidence.cells).sort((leftCell, rightCell) => leftCell - rightCell),
      digits: evidence.digits,
      domains: evidence.domains
        .map((domain) => ({ ...domain, cell: cellMap(domain.cell) }))
        .sort((leftDomain, rightDomain) => leftDomain.cell - rightDomain.cell),
    }
    switch (evidence.kind) {
      case 'subset':
        return {
          ...common,
          kind: 'subset',
          unit: unitMap(evidence.unit),
          hidden: evidence.hidden,
        }
      case 'fish':
        return {
          ...common,
          kind: 'fish',
          bases: evidence.bases.map(unitMap),
          covers: evidence.covers.map(unitMap),
        }
      case 'wing':
        return {
          ...common,
          kind: 'wing',
          pivot: cellMap(evidence.pivot),
          wings: [cellMap(evidence.wings[0]), cellMap(evidence.wings[1])],
        }
      case 'coloring': {
        const links: Extract<AdvancedEvidence, { kind: 'coloring' }>['links'] = evidence.links.map(
          (link) => ({
            unit: unitMap(link.unit),
            cells: [cellMap(link.cells[0]), cellMap(link.cells[1])],
          }),
        )
        return {
          ...common,
          kind: 'coloring',
          mode: evidence.mode,
          colors: [cells(evidence.colors[0]), cells(evidence.colors[1])],
          links,
        }
      }
    }
  }

  const board = stage.board.map((_, cell) => stage.board[cellMap(cell)])
  const candidates = stage.candidates.map((_, cell) => stage.candidates[cellMap(cell)])

  const symmetry = transform === 'rotate' ? HALF_TURN_SYMMETRY : TRANSPOSE_SYMMETRY
  const rules =
    stage.rules.kind === 'classic'
      ? stage.rules
      : calculation.transformRules({
          rules: copyRules(stage.rules),
          symmetry,
        })

  const step =
    stage.step.kind === 'placement'
      ? {
          ...stage.step,
          cell: cellMap(stage.step.cell),
          evidence: proofMap(stage.step.evidence),
        }
      : {
          ...stage.step,
          removals: stage.step.removals
            .map((removal) => ({ ...removal, cell: cellMap(removal.cell) }))
            .sort(
              (leftRemoval, rightRemoval) =>
                leftRemoval.cell - rightRemoval.cell || leftRemoval.digit - rightRemoval.digit,
            ),
          evidence: proofMap(stage.step.evidence),
        }

  return {
    board,
    candidates,
    rules,
    step,
  }
}
