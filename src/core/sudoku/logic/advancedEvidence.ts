import { digitsIn, maskOf, PEERS, UNITS } from '@/core/sudoku/board'
import type { SudokuUnit, Unit } from '@/core/sudoku/rules/types'
import type { LogicalState, LogicalStep } from '@/core/sudoku/logic/types'
import { isAdvancedTechnique, isAdvancedEvidence } from '@/core/sudoku/logic/techniques'
import { available, collision } from '@/core/sudoku/logic/patternFacts'

function unitFor(unit: Unit): SudokuUnit | undefined {
  return UNITS.find((candidate) => candidate.kind === unit.kind && candidate.index === unit.index)
}

function equalSet(first: readonly number[], second: readonly number[]): boolean {
  return (
    first.length === second.length &&
    new Set(first).size === first.length &&
    first.every((cell) => second.includes(cell))
  )
}

/** Check the supplied proof directly; never accept a claimed conclusion by rerunning a detector. */
export function validateAdvancedStep(state: LogicalState, step: LogicalStep): boolean {
  const evidence = step.evidence
  if (
    !isAdvancedEvidence(evidence) ||
    step.kind !== 'elimination' ||
    !isAdvancedTechnique(step.technique) ||
    (state.context && state.context.rules.kind !== 'classic')
  ) {
    return false
  }
  if (
    evidence.domains.length !== 81 ||
    !evidence.domains.every(
      ({ cell, mask }, index) =>
        cell === index && mask === (state.board[cell] === 0 ? state.candidates[cell] : 0),
    )
  ) {
    return false
  }
  const removals = step.removals
  if (
    !removals.length ||
    new Set(removals.map(({ cell, digit }) => `${cell}:${digit}`)).size !== removals.length ||
    !removals.every(
      ({ cell, digit }) =>
        state.board[cell] === 0 && (state.candidates[cell] & maskOf(digit)) !== 0,
    )
  ) {
    return false
  }
  if (evidence.kind === 'subset') {
    const unit = unitFor(evidence.unit)
    if (
      !unit ||
      evidence.cells.length !== 3 ||
      evidence.digits.length !== 3 ||
      !evidence.cells.every((cell) => unit.cells.includes(cell) && state.board[cell] === 0) ||
      step.technique !== (evidence.hidden ? 'hidden-triple' : 'naked-triple')
    ) {
      return false
    }
    if (evidence.hidden) {
      const positions = evidence.digits.map((digit) => available(state, unit.cells, digit))
      return (
        positions.every((cells) => cells.length >= 2) &&
        equalSet([...new Set(positions.flat())], evidence.cells) &&
        removals.every(
          ({ cell, digit }) => evidence.cells.includes(cell) && !evidence.digits.includes(digit),
        )
      )
    }
    return (
      evidence.cells.every((cell) => digitsIn(state.candidates[cell]).length >= 2) &&
      equalSet(
        digitsIn(evidence.cells.reduce((mask, cell) => mask | state.candidates[cell], 0)),
        evidence.digits,
      ) &&
      removals.every(
        ({ cell, digit }) =>
          unit.cells.includes(cell) &&
          !evidence.cells.includes(cell) &&
          evidence.digits.includes(digit),
      )
    )
  }
  if (evidence.kind === 'fish') {
    const size = step.technique === 'x-wing' ? 2 : step.technique === 'swordfish' ? 3 : 0
    const bases = evidence.bases.map(unitFor)
    const covers = evidence.covers.map(unitFor)
    const digit = evidence.digits[0]
    if (
      !size ||
      evidence.digits.length !== 1 ||
      bases.length !== size ||
      covers.length !== size ||
      !bases.every((unit) => unit !== undefined) ||
      !covers.every((unit) => unit !== undefined)
    ) {
      return false
    }
    const kind = bases[0].kind
    if (
      (kind !== 'row' && kind !== 'column') ||
      !bases.every((unit) => unit.kind === kind) ||
      !covers.every((unit) => unit.kind === (kind === 'row' ? 'column' : 'row')) ||
      new Set(bases.map((unit) => unit.index)).size !== size ||
      new Set(covers.map((unit) => unit.index)).size !== size
    ) {
      return false
    }
    const positions = bases.map((unit) => available(state, unit.cells, digit))
    return (
      positions.every((cells) => cells.length >= 2 && cells.length <= size) &&
      equalSet(positions.flat(), evidence.cells) &&
      positions.flat().every((cell) => covers.some((unit) => unit.cells.includes(cell))) &&
      covers.every((unit) => positions.flat().some((cell) => unit.cells.includes(cell))) &&
      removals.every(
        (removal) =>
          removal.digit === digit &&
          covers.some((unit) => unit.cells.includes(removal.cell)) &&
          !bases.some((unit) => unit.cells.includes(removal.cell)),
      )
    )
  }
  if (evidence.kind === 'wing') {
    const [first, second] = evidence.wings
    const pivot = evidence.pivot
    const masks = [pivot, first, second].map((cell) => state.candidates[cell])
    const shared = digitsIn(masks[1] & masks[2] & ~masks[0])
    return (
      step.technique === 'xy-wing' &&
      equalSet(evidence.cells, [pivot, first, second]) &&
      evidence.cells.every((cell) => state.board[cell] === 0) &&
      masks.every((mask) => digitsIn(mask).length === 2) &&
      PEERS[pivot].includes(first) &&
      PEERS[pivot].includes(second) &&
      shared.length === 1 &&
      equalSet(evidence.digits, digitsIn(masks[0] | masks[1] | masks[2])) &&
      digitsIn(masks[0] & masks[1]).length === 1 &&
      digitsIn(masks[0] & masks[2]).length === 1 &&
      (masks[0] & masks[1]) !== (masks[0] & masks[2]) &&
      removals.every(
        ({ cell, digit }) =>
          digit === shared[0] &&
          !evidence.cells.includes(cell) &&
          PEERS[first].includes(cell) &&
          PEERS[second].includes(cell),
      )
    )
  }
  const [first, second] = evidence.colors
  const digit = evidence.digits[0]
  if (
    step.technique !== 'simple-coloring' ||
    evidence.digits.length !== 1 ||
    !first.length ||
    !second.length ||
    !equalSet([...first, ...second], evidence.cells) ||
    !evidence.cells.every((cell) => available(state, [cell], digit).length === 1)
  ) {
    return false
  }
  const linked = new Set<number>([first[0]])
  for (const link of evidence.links) {
    const unit = unitFor(link.unit)
    if (
      !unit ||
      unit.cells.some((cell) => state.board[cell] === digit) ||
      !equalSet(available(state, unit.cells, digit), link.cells) ||
      !link.cells.every((cell) => evidence.cells.includes(cell)) ||
      first.includes(link.cells[0]) === first.includes(link.cells[1])
    ) {
      return false
    }
  }
  // Reachability prevents two unrelated chains from being presented as one color choice.
  for (let pass = 0; pass < evidence.cells.length; pass++) {
    for (const { cells } of evidence.links) {
      if (cells.some((cell) => linked.has(cell))) {
        cells.forEach((cell) => linked.add(cell))
      }
    }
  }
  if (linked.size !== evidence.cells.length) {
    return false
  }
  const conflicts = [collision(first), collision(second)]
  if (evidence.mode === 'wrap') {
    return (
      conflicts[0] !== conflicts[1] &&
      removals.every(
        ({ cell, digit: removed }) =>
          removed === digit && evidence.colors[conflicts[0] ? 0 : 1].includes(cell),
      )
    )
  }
  return (
    !conflicts.some(Boolean) &&
    removals.every(
      ({ cell, digit: removed }) =>
        removed === digit &&
        !evidence.cells.includes(cell) &&
        first.some((other) => PEERS[cell].includes(other)) &&
        second.some((other) => PEERS[cell].includes(other)),
    )
  )
}
