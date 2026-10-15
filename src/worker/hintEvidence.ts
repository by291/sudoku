import type { Board, Digit, ParseResult } from '@/core/sudoku/types'
import type { HintResult } from '@/core/sudoku/hint'
import { isCellIndex } from '@/core/sudoku/board'
import { ALL_DIGITS_MASK, isDigit, isRecord } from '@/core/sudoku/types'
import {
  TECHNIQUE_NAMES,
  isClassicTechnique,
  matchesRuleTechnique,
  isAdvancedEvidence,
  isAdvancedTechnique,
} from '@/core/sudoku/techniques'
import type {
  AdvancedEvidence,
  LogicalStep,
  Technique,
  RuleEvidence,
} from '@/core/sudoku/techniques'
import { validateAdvancedStep } from '@/core/sudoku/advancedTechniques'
import { createLogicalWorkspace, findLogicalStep, applyLogicalStep } from '@/core/sudoku/logic'
import { createWorkBudget, consumeWork, DEFAULT_WORK_LIMIT } from '@/core/sudoku/budget'
import { compileRules, constraintCells, parseRules } from '@/core/sudoku/rules/context'
import type { PuzzleRules, Unit } from '@/core/sudoku/rules/types'

function isIndex(value: unknown): value is number {
  return typeof value === 'number' && isCellIndex(value)
}

function isTechnique(value: unknown): value is Technique {
  return typeof value === 'string' && Object.hasOwn(TECHNIQUE_NAMES, value)
}

function parseUnit(value: unknown): Unit | null {
  if (!isRecord(value) || typeof value.index !== 'number' || !Number.isInteger(value.index)) {
    return null
  }

  const kind = value.kind
  if (
    kind !== 'row' &&
    kind !== 'column' &&
    kind !== 'box' &&
    kind !== 'region' &&
    kind !== 'diagonal'
  ) {
    return null
  }

  if (value.index < 0 || value.index > (kind === 'diagonal' ? 1 : 8)) {
    return null
  }

  return { kind, index: value.index }
}

function isCellList(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 10 &&
    value.every(isIndex) &&
    new Set(value).size === value.length
  )
}

function isDigitList(value: unknown): value is Digit[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 9 &&
    value.every(isDigit) &&
    new Set(value).size === value.length
  )
}

function parseRuleEvidence(value: unknown): RuleEvidence | null {
  if (
    !isRecord(value) ||
    typeof value.constraintId !== 'string' ||
    !isCellList(value.cells) ||
    !isDigitList(value.digits)
  ) {
    return null
  }

  const common = { constraintId: value.constraintId, cells: value.cells, digits: value.digits }
  if (value.kind === 'thermo') {
    if (
      !isCellList(value.path) ||
      !parseRules({ kind: 'thermo', paths: [value.path] }).valid ||
      !Array.isArray(value.bounds) ||
      value.bounds.length !== value.cells.length
    ) {
      return null
    }

    const bounds: { cell: number; min: Digit; max: Digit }[] = []

    for (const raw of value.bounds) {
      const bound: unknown = raw
      if (
        !isRecord(bound) ||
        !isIndex(bound.cell) ||
        !isDigit(bound.min) ||
        !isDigit(bound.max) ||
        bound.min > bound.max ||
        !value.cells.includes(bound.cell) ||
        bounds.some((other) => other.cell === bound.cell)
      ) {
        return null
      }

      bounds.push({ cell: bound.cell, min: bound.min, max: bound.max })
    }

    return { ...common, kind: 'thermo', path: value.path, bounds }
  }

  if (!Array.isArray(value.domains) || value.domains.length !== value.cells.length) {
    return null
  }

  const domains: { cell: number; mask: number }[] = []

  for (const raw of value.domains) {
    const domain: unknown = raw
    if (
      !isRecord(domain) ||
      !isIndex(domain.cell) ||
      typeof domain.mask !== 'number' ||
      !Number.isInteger(domain.mask) ||
      domain.mask < 1 ||
      domain.mask > ALL_DIGITS_MASK ||
      domain.cell !== value.cells[domains.length]
    ) {
      return null
    }

    domains.push({ cell: domain.cell, mask: domain.mask })
  }

  if (
    value.kind === 'cage' &&
    typeof value.sum === 'number' &&
    Number.isInteger(value.sum) &&
    value.cells.length <= 9
  ) {
    const count = value.cells.length
    if (value.sum < (count * (count + 1)) / 2 || value.sum > (count * (19 - count)) / 2) {
      return null
    }

    return { ...common, kind: 'cage', sum: value.sum, domains }
  }

  if (
    value.kind === 'arrow' &&
    isIndex(value.circle) &&
    isCellList(value.shaft) &&
    parseRules({ kind: 'arrow', arrows: [{ circle: value.circle, shaft: value.shaft }] }).valid
  ) {
    return { ...common, kind: 'arrow', circle: value.circle, shaft: value.shaft, domains }
  }

  return null
}

function parseLogicalEvidence(value: unknown): LogicalStep['evidence'] | null {
  if (!isRecord(value)) {
    return null
  }

  if (
    value.kind === 'subset' ||
    value.kind === 'fish' ||
    value.kind === 'wing' ||
    value.kind === 'coloring'
  ) {
    return parseAdvancedEvidence(value)
  }

  if (value.kind !== 'unit') {
    return parseRuleEvidence(value)
  }

  const unit = parseUnit(value.unit)
  if (
    !unit ||
    !isCellList(value.cells) ||
    value.cells.length > 9 ||
    !isDigitList(value.digits) ||
    !Array.isArray(value.premises) ||
    value.premises.length > 500
  ) {
    return null
  }

  const premises: RuleEvidence[] = []

  for (const raw of value.premises) {
    const parsed = parseRuleEvidence(raw)
    if (!parsed) {
      return null
    }

    premises.push(parsed)
  }

  const units: Unit[] = []
  if (value.units !== undefined) {
    if (!Array.isArray(value.units) || value.units.length > 29) {
      return null
    }

    for (const raw of value.units) {
      const parsed = parseUnit(raw)
      if (!parsed) {
        return null
      }

      units.push(parsed)
    }
  }

  return { kind: 'unit', unit, cells: value.cells, digits: value.digits, premises, units }
}

function parseAdvancedEvidence(value: Record<string, unknown>): AdvancedEvidence | null {
  if (
    !Array.isArray(value.cells) ||
    value.cells.length < 1 ||
    value.cells.length > 81 ||
    !value.cells.every(isIndex) ||
    new Set(value.cells).size !== value.cells.length ||
    !isDigitList(value.digits) ||
    !Array.isArray(value.domains) ||
    value.domains.length !== 81
  ) {
    return null
  }
  const domains: { cell: number; mask: number }[] = []
  for (const raw of value.domains) {
    if (
      !isRecord(raw) ||
      raw.cell !== domains.length ||
      typeof raw.mask !== 'number' ||
      !Number.isInteger(raw.mask) ||
      raw.mask < 0 ||
      raw.mask > ALL_DIGITS_MASK
    ) {
      return null
    }
    domains.push({ cell: domains.length, mask: raw.mask })
  }
  const common = { cells: value.cells, digits: value.digits, domains }
  if (value.kind === 'subset') {
    const unit = parseUnit(value.unit)
    return unit && typeof value.hidden === 'boolean'
      ? { ...common, kind: 'subset', unit, hidden: value.hidden }
      : null
  }
  if (value.kind === 'fish') {
    if (
      !Array.isArray(value.bases) ||
      !Array.isArray(value.covers) ||
      value.bases.length < 2 ||
      value.bases.length > 3 ||
      value.covers.length !== value.bases.length
    ) {
      return null
    }
    const bases = value.bases.map(parseUnit)
    const covers = value.covers.map(parseUnit)
    return bases.every((unit) => unit !== null) && covers.every((unit) => unit !== null)
      ? { ...common, kind: 'fish', bases, covers }
      : null
  }
  if (value.kind === 'wing') {
    return isIndex(value.pivot) && isCellList(value.wings) && value.wings.length === 2
      ? { ...common, kind: 'wing', pivot: value.pivot, wings: [value.wings[0], value.wings[1]] }
      : null
  }
  if (
    value.kind !== 'coloring' ||
    (value.mode !== 'trap' && value.mode !== 'wrap') ||
    !Array.isArray(value.colors) ||
    value.colors.length !== 2 ||
    !Array.isArray(value.links) ||
    !value.links.length ||
    value.links.length > 27
  ) {
    return null
  }
  const groups: number[][] = []
  for (const group of value.colors) {
    if (
      !Array.isArray(group) ||
      !group.length ||
      group.length > 81 ||
      !group.every(isIndex) ||
      new Set(group).size !== group.length
    ) {
      return null
    }
    groups.push(group)
  }
  const links: Extract<AdvancedEvidence, { kind: 'coloring' }>['links'][number][] = []
  for (const link of value.links) {
    if (!isRecord(link) || !isCellList(link.cells) || link.cells.length !== 2) {
      return null
    }
    const unit = parseUnit(link.unit)
    if (!unit) {
      return null
    }
    links.push({ unit, cells: [link.cells[0], link.cells[1]] })
  }
  return { ...common, kind: 'coloring', mode: value.mode, colors: [groups[0], groups[1]], links }
}

function parseStep(value: unknown): LogicalStep | null {
  if (!isRecord(value) || !isTechnique(value.technique)) {
    return null
  }

  const evidence = parseLogicalEvidence(value.evidence)
  if (!evidence) {
    return null
  }

  const matches = isAdvancedEvidence(evidence)
    ? isAdvancedTechnique(value.technique)
    : evidence.kind === 'unit'
      ? isClassicTechnique(value.technique) && !isAdvancedTechnique(value.technique)
      : matchesRuleTechnique(value.technique, evidence.kind)
  if (!matches) {
    return null
  }

  const common = { technique: value.technique, evidence }
  if (value.kind === 'placement' && isIndex(value.cell) && isDigit(value.digit)) {
    return { ...common, kind: 'placement', cell: value.cell, digit: value.digit }
  }

  if (
    value.kind !== 'elimination' ||
    !Array.isArray(value.removals) ||
    !value.removals.length ||
    value.removals.length > 81 * 9
  ) {
    return null
  }

  const removals: { cell: number; digit: Digit }[] = []

  for (const removal of value.removals) {
    if (!isRecord(removal) || !isIndex(removal.cell) || !isDigit(removal.digit)) {
      return null
    }

    removals.push({ cell: removal.cell, digit: removal.digit })
  }

  return { ...common, kind: 'elimination', removals }
}

export function parseHint(value: unknown): HintResult | null {
  if (!isRecord(value)) {
    return null
  }

  if (value.kind === 'review-entry' && isIndex(value.cell)) {
    return { kind: value.kind, cell: value.cell }
  }

  if (
    value.kind === 'unavailable' &&
    (value.reason === 'complete' ||
      value.reason === 'unsupported' ||
      value.reason === 'budget-exhausted')
  ) {
    return { kind: value.kind, reason: value.reason }
  }

  if (
    value.kind !== 'deduction' ||
    !Array.isArray(value.steps) ||
    !value.steps.length ||
    value.steps.length > 500 ||
    !isRecord(value.placement) ||
    !isIndex(value.placement.cell) ||
    !isDigit(value.placement.digit)
  ) {
    return null
  }

  const steps: LogicalStep[] = []

  for (const step of value.steps) {
    const parsed = parseStep(step)
    if (!parsed) {
      return null
    }

    steps.push(parsed)
  }

  const final = steps.at(-1)
  if (
    !final ||
    steps.slice(0, -1).some((step) => step.kind === 'placement') ||
    final.kind !== 'placement' ||
    final.cell !== value.placement.cell ||
    final.digit !== value.placement.digit
  ) {
    return null
  }

  return { kind: 'deduction', steps, placement: { cell: final.cell, digit: final.digit } }
}

export function validateHintEvidence(
  hint: HintResult,
  rules: PuzzleRules,
  board?: Board,
): ParseResult<HintResult> {
  const parsed = parseHint(hint)
  const invalid: ParseResult<HintResult> = {
    valid: false,
    issues: ['Hint evidence does not match the requested rules'],
  }
  if (!parsed) {
    return invalid
  }

  if (parsed.kind !== 'deduction') {
    return { valid: true, value: parsed }
  }

  // Valid shape is insufficient: evidence must name the exact clue and ordered geometry requested.
  const context = compileRules(rules)
  const state = board ? createLogicalWorkspace(board, context) : null
  const budget = createWorkBudget(DEFAULT_WORK_LIMIT)
  const equalCells = (first: readonly number[], second: readonly number[]) =>
    first.length === second.length && first.every((cell, index) => cell === second[index])

  function clueMatches(evidence: RuleEvidence): boolean {
    const constraint = context.constraints.find(
      (candidate) => candidate.id === evidence.constraintId,
    )
    if (
      !constraint ||
      constraint.kind !== evidence.kind ||
      !equalCells(constraintCells(constraint), evidence.cells)
    ) {
      return false
    }

    if (evidence.kind === 'cage' && constraint.kind === 'cage') {
      return evidence.sum === constraint.sum
    }

    if (evidence.kind === 'thermo' && constraint.kind === 'thermo') {
      return equalCells(evidence.path, constraint.cells)
    }

    return (
      evidence.kind === 'arrow' &&
      constraint.kind === 'arrow' &&
      evidence.circle === constraint.circle &&
      equalCells(evidence.shaft, constraint.shaft)
    )
  }

  for (const step of parsed.steps) {
    const evidence = step.evidence
    if (isAdvancedEvidence(evidence)) {
      if (!state || !consumeWork(budget, 81 * 81) || !validateAdvancedStep(state, step)) {
        return invalid
      }
    } else if (evidence.kind === 'unit') {
      const unit = context.units.find(
        (candidate) =>
          candidate.kind === evidence.unit.kind && candidate.index === evidence.unit.index,
      )
      if (
        !unit ||
        !evidence.cells.every((cell) => unit.cells.includes(cell)) ||
        !evidence.premises.every(clueMatches)
      ) {
        return invalid
      }

      if (
        !evidence.units?.every((other) =>
          context.units.some(
            (candidate) => candidate.kind === other.kind && candidate.index === other.index,
          ),
        )
      ) {
        return invalid
      }

      if (step.kind === 'placement' && !unit.cells.includes(step.cell)) {
        return invalid
      }

      if (
        step.kind === 'elimination' &&
        step.technique !== 'locked-candidate' &&
        !step.removals.every((removal) => unit.cells.includes(removal.cell))
      ) {
        return invalid
      }
    } else {
      if (!clueMatches(evidence)) {
        return invalid
      }

      const affected =
        step.kind === 'placement' ? [step.cell] : step.removals.map((removal) => removal.cell)
      if (!affected.every((cell) => evidence.cells.includes(cell))) {
        return invalid
      }
    }

    if (state) {
      if (!isAdvancedEvidence(evidence)) {
        const expected = findLogicalStep(state, [step.technique], budget)
        if (expected.status !== 'complete' || !expected.step || expected.step.kind !== step.kind) {
          return invalid
        }
        const actual = expected.step
        if (
          step.kind === 'placement'
            ? actual.kind !== 'placement' ||
              actual.cell !== step.cell ||
              actual.digit !== step.digit
            : actual.kind !== 'elimination' ||
              JSON.stringify(actual.removals) !== JSON.stringify(step.removals)
        ) {
          return invalid
        }
      }
      applyLogicalStep(state, step)
    }
  }

  return { valid: true, value: parsed }
}
