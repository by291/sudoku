import type { Digit, LogicalStep, RuleEvidence, Unit } from '@/sudoku/contracts'
import { isTechnique } from '@/sudoku/catalogue'
import { isRulesShape } from '@/sudoku/guards'
import {
  ALL_DIGITS_MASK,
  BOARD_SIZE,
  UNIT_SIZE,
  isBoard,
  isCellIndex,
  isDigit,
  isRecord,
} from '@/sudoku/values'
import type { ExerciseAnswer, ExerciseStage } from '@/features/learning/model/exerciseStages'

function isList<Value>(value: unknown, guard: (item: unknown) => item is Value): value is Value[] {
  return Array.isArray(value) && value.every(guard)
}

function isMask(value: unknown): value is number {
  return (
    Number.isInteger(value) && typeof value === 'number' && value >= 0 && value <= ALL_DIGITS_MASK
  )
}

function isUnit(value: unknown): value is Unit {
  if (!isRecord(value) || !Number.isInteger(value.index) || typeof value.index !== 'number') {
    return false
  }

  switch (value.kind) {
    case 'row':
    case 'column':
    case 'box':
    case 'region':
      return value.index >= 0 && value.index < UNIT_SIZE
    case 'diagonal':
      return value.index === 0 || value.index === 1
    default:
      return false
  }
}

function isDomain(value: unknown): value is { cell: number; mask: number } {
  return isRecord(value) && isCellIndex(value.cell) && isMask(value.mask)
}

function isPlacement(
  value: unknown,
): value is Extract<ExerciseAnswer, { kind: 'placement' }>['expected'] {
  return isRecord(value) && isCellIndex(value.cell) && isDigit(value.digit)
}

function hasEvidenceCells(value: Record<string, unknown>): boolean {
  return isList(value.cells, isCellIndex) && isList(value.digits, isDigit)
}

function isRuleEvidence(value: unknown): value is RuleEvidence {
  if (!isRecord(value) || !hasEvidenceCells(value) || typeof value.constraintId !== 'string') {
    return false
  }

  switch (value.kind) {
    case 'cage':
      return Number.isSafeInteger(value.sum) && isList(value.domains, isDomain)
    case 'arrow':
      return (
        isCellIndex(value.circle) &&
        isList(value.shaft, isCellIndex) &&
        isList(value.domains, isDomain)
      )
    case 'thermo':
      return (
        isList(value.path, isCellIndex) &&
        isList(
          value.bounds,
          (bound): bound is { cell: number; min: Digit; max: Digit } =>
            isRecord(bound) && isCellIndex(bound.cell) && isDigit(bound.min) && isDigit(bound.max),
        )
      )
    default:
      return false
  }
}

function isEvidence(value: unknown): value is LogicalStep['evidence'] {
  if (!isRecord(value) || !hasEvidenceCells(value)) {
    return false
  }
  if (value.kind === 'cage' || value.kind === 'arrow' || value.kind === 'thermo') {
    return isRuleEvidence(value)
  }
  if (value.kind === 'unit') {
    return (
      isUnit(value.unit) &&
      isList(value.premises, isRuleEvidence) &&
      (value.units === undefined || isList(value.units, isUnit))
    )
  }
  if (!isList(value.domains, isDomain)) {
    return false
  }

  switch (value.kind) {
    case 'subset':
      return isUnit(value.unit) && typeof value.hidden === 'boolean'
    case 'fish':
      return isList(value.bases, isUnit) && isList(value.covers, isUnit)
    case 'wing':
      return (
        isCellIndex(value.pivot) && isList(value.wings, isCellIndex) && value.wings.length === 2
      )
    case 'coloring':
      return (
        (value.mode === 'trap' || value.mode === 'wrap') &&
        Array.isArray(value.colors) &&
        value.colors.length === 2 &&
        value.colors.every((color: unknown) => isList(color, isCellIndex)) &&
        Array.isArray(value.links) &&
        value.links.every(
          (link: unknown) =>
            isRecord(link) &&
            isUnit(link.unit) &&
            isList(link.cells, isCellIndex) &&
            link.cells.length === 2,
        )
      )
    default:
      return false
  }
}

function isStep(value: unknown): value is LogicalStep {
  if (!isRecord(value) || !isTechnique(value.technique) || !isEvidence(value.evidence)) {
    return false
  }

  switch (value.kind) {
    case 'placement':
      return isPlacement(value)
    case 'elimination':
      return isList(value.removals, isPlacement) && value.removals.length > 0
    default:
      return false
  }
}

export function isExerciseAnswer(value: unknown): value is ExerciseAnswer {
  return (
    isRecord(value) &&
    ((value.kind === 'placement' && isPlacement(value.expected)) ||
      (value.kind === 'elimination' &&
        isList(value.expected, isPlacement) &&
        value.expected.length > 0))
  )
}

/** Validate transport shape only. The mandatory build gate proves bundled Sudoku facts in Rust. */
export function isExerciseStage(value: unknown): value is ExerciseStage {
  return (
    isRecord(value) &&
    isBoard(value.board) &&
    isList(value.candidates, isMask) &&
    value.candidates.length === BOARD_SIZE &&
    isRulesShape(value.rules) &&
    isStep(value.step)
  )
}
