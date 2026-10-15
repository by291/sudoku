import { digitsIn, maskOf, PEERS, UNITS } from '@/core/sudoku/board'
import type { SudokuUnit, Unit } from '@/core/sudoku/board'
import { consumeWork } from '@/core/sudoku/budget'
import type { WorkBudget } from '@/core/sudoku/budget'
import type {
  AdvancedEvidence,
  AdvancedTechnique,
  LogicalState,
  LogicalStep,
  Technique,
} from '@/core/sudoku/techniques'
import { isAdvancedTechnique, isAdvancedEvidence } from '@/core/sudoku/techniques'
import { DIGITS } from '@/core/sudoku/types'
import type { Digit } from '@/core/sudoku/types'
import type { StepOutcome } from '@/core/sudoku/variantTechniques'

function* combinations<T>(
  values: readonly T[],
  size: number,
  start = 0,
  prefix: readonly T[] = [],
): Generator<readonly T[]> {
  if (prefix.length === size) {
    yield prefix
    return
  }
  for (let index = start; index <= values.length - (size - prefix.length); index++) {
    yield* combinations(values, size, index + 1, [...prefix, values[index]])
  }
}

function available(state: LogicalState, cells: readonly number[], digit: Digit): number[] {
  const matches: number[] = []
  const bit = maskOf(digit)
  for (let index = 0; index < cells.length; index++) {
    const cell = cells[index]
    if (state.board[cell] === 0 && (state.candidates[cell] & bit) !== 0) {
      matches.push(cell)
    }
  }

  return matches
}

function identity(unit: SudokuUnit): Unit {
  return { kind: unit.kind, index: unit.index }
}

function facts(state: LogicalState, cells: readonly number[], digits: readonly Digit[]) {
  // The snapshot is compared to replayed candidates at the transport boundary; it cannot assert its own premises.
  return {
    cells: [...cells].sort((a, b) => a - b),
    digits,
    domains: state.candidates.map((mask, cell) => ({
      cell,
      mask: state.board[cell] === 0 ? mask : 0,
    })),
  }
}

function deduction(
  state: LogicalState,
  technique: AdvancedTechnique,
  evidence: AdvancedEvidence,
  targets: readonly number[],
  digits: readonly Digit[],
): LogicalStep | null {
  const removals = [...new Set(targets)]
    .sort((a, b) => a - b)
    .flatMap((cell) =>
      digits
        .filter(
          (digit) => state.board[cell] === 0 && (state.candidates[cell] & maskOf(digit)) !== 0,
        )
        .map((digit) => ({ cell, digit })),
    )
  return removals.length ? { kind: 'elimination', technique, evidence, removals } : null
}

function subsets(state: LogicalState, hidden: boolean, budget: WorkBudget): StepOutcome {
  for (const unit of UNITS) {
    const empty = unit.cells.filter((cell) => state.board[cell] === 0)
    const choices = hidden
      ? DIGITS
      : empty.filter((cell) => {
          const count = digitsIn(state.candidates[cell]).length
          return count >= 2 && count <= 3
        })
    for (const choice of combinations(choices, 3)) {
      if (!consumeWork(budget)) {
        return { status: 'budget-exhausted' }
      }
      const digits = hidden
        ? DIGITS.filter((digit) => choice.includes(digit))
        : digitsIn(choice.reduce((mask, cell) => mask | state.candidates[cell], 0))
      const locations = digits.map((digit) => available(state, unit.cells, digit))
      const cells = hidden ? [...new Set(locations.flat())] : [...choice]
      if (
        digits.length !== 3 ||
        cells.length !== 3 ||
        (hidden && locations.some((positions) => positions.length < 2))
      ) {
        continue
      }
      const evidence: AdvancedEvidence = {
        ...facts(state, cells, digits),
        kind: 'subset',
        unit: identity(unit),
        hidden,
      }
      const step = hidden
        ? deduction(
            state,
            'hidden-triple',
            evidence,
            cells,
            DIGITS.filter((digit) => !digits.includes(digit)),
          )
        : deduction(
            state,
            'naked-triple',
            evidence,
            empty.filter((cell) => !cells.includes(cell)),
            digits,
          )
      if (step) {
        return { status: 'complete', step }
      }
    }
  }
  return { status: 'complete', step: null }
}

function fish(state: LogicalState, size: 2 | 3, budget: WorkBudget): StepOutcome {
  for (const kind of ['row', 'column'] as const) {
    const bases = UNITS.filter((unit) => unit.kind === kind)
    const covers = UNITS.filter((unit) => unit.kind === (kind === 'row' ? 'column' : 'row'))
    for (const digit of DIGITS) {
      const possible = bases.filter((unit) => {
        const count = available(state, unit.cells, digit).length
        return count >= 2 && count <= size
      })
      for (const selected of combinations(possible, size)) {
        if (!consumeWork(budget)) {
          return { status: 'budget-exhausted' }
        }
        const cells = selected.flatMap((unit) => available(state, unit.cells, digit))
        const covering = covers.filter((unit) => cells.some((cell) => unit.cells.includes(cell)))
        if (covering.length !== size) {
          continue
        }
        const evidence: AdvancedEvidence = {
          ...facts(state, cells, [digit]),
          kind: 'fish',
          bases: selected.map(identity),
          covers: covering.map(identity),
        }
        const targets = covering
          .flatMap((unit) => unit.cells)
          .filter((cell) => !selected.some((unit) => unit.cells.includes(cell)))
        const step = deduction(state, size === 2 ? 'x-wing' : 'swordfish', evidence, targets, [
          digit,
        ])
        if (step) {
          return { status: 'complete', step }
        }
      }
    }
  }
  return { status: 'complete', step: null }
}

function wings(state: LogicalState, budget: WorkBudget): StepOutcome {
  const bivalue = state.candidates.flatMap((mask, cell) =>
    state.board[cell] === 0 && digitsIn(mask).length === 2 ? [cell] : [],
  )
  for (const pivot of bivalue) {
    const peers = bivalue.filter((cell) => PEERS[pivot].includes(cell))
    for (const pair of combinations(peers, 2)) {
      if (!consumeWork(budget)) {
        return { status: 'budget-exhausted' }
      }
      const first = pair[0]
      const second = pair[1]
      const pivotMask = state.candidates[pivot]
      const firstMask = state.candidates[first]
      const secondMask = state.candidates[second]
      const shared = digitsIn(firstMask & secondMask & ~pivotMask)
      if (
        shared.length !== 1 ||
        digitsIn(firstMask & pivotMask).length !== 1 ||
        digitsIn(secondMask & pivotMask).length !== 1 ||
        (firstMask & pivotMask) === (secondMask & pivotMask)
      ) {
        continue
      }
      const evidence: AdvancedEvidence = {
        ...facts(state, [pivot, first, second], digitsIn(pivotMask | firstMask | secondMask)),
        kind: 'wing',
        pivot,
        wings: [first, second],
      }
      const targets = PEERS[first].filter((cell) => PEERS[second].includes(cell) && cell !== pivot)
      const step = deduction(state, 'xy-wing', evidence, targets, shared)
      if (step) {
        return { status: 'complete', step }
      }
    }
  }
  return { status: 'complete', step: null }
}

function collision(cells: readonly number[]): boolean {
  return cells.some((cell, index) =>
    cells.slice(index + 1).some((other) => PEERS[cell].includes(other)),
  )
}

function coloring(state: LogicalState, budget: WorkBudget): StepOutcome {
  for (const digit of DIGITS) {
    const links: Extract<AdvancedEvidence, { kind: 'coloring' }>['links'][number][] = []
    for (const unit of UNITS) {
      if (!consumeWork(budget)) {
        return { status: 'budget-exhausted' }
      }
      const cells = available(state, unit.cells, digit)
      if (cells.length === 2 && !unit.cells.some((cell) => state.board[cell] === digit)) {
        links.push({ unit: identity(unit), cells: [cells[0], cells[1]] })
      }
    }
    const visited = new Set<number>()
    for (const start of links.flatMap(({ cells }) => cells)) {
      if (visited.has(start)) {
        continue
      }
      const assignments = new Map<number, 0 | 1>([[start, 0]])
      const queue = [start]
      let contradictory = false
      for (let index = 0; index < queue.length; index++) {
        const cell = queue[index]
        visited.add(cell)
        for (const link of links.filter(({ cells }) => cells.includes(cell))) {
          if (!consumeWork(budget)) {
            return { status: 'budget-exhausted' }
          }
          const other = link.cells[0] === cell ? link.cells[1] : link.cells[0]
          const opposite = assignments.get(cell) === 0 ? 1 : 0
          if (assignments.has(other)) {
            contradictory ||= assignments.get(other) !== opposite
          } else {
            assignments.set(other, opposite)
            queue.push(other)
          }
        }
      }
      const colors: [number[], number[]] = [[], []]
      for (const [cell, color] of assignments) {
        colors[color].push(cell)
      }
      colors.forEach((group) => group.sort((a, b) => a - b))
      const conflicts = colors.map(collision)
      // An odd strong-link cycle or two impossible colors is a contradictory domain, not a hint.
      if (contradictory || conflicts.every(Boolean)) {
        continue
      }
      const mode = conflicts.some(Boolean) ? 'wrap' : 'trap'
      const targets =
        mode === 'wrap'
          ? colors[conflicts[0] ? 0 : 1]
          : available(
              state,
              Array.from({ length: 81 }, (_, cell) => cell),
              digit,
            ).filter(
              (cell) =>
                !assignments.has(cell) &&
                colors.every((group) => group.some((other) => PEERS[cell].includes(other))),
            )
      const evidence: AdvancedEvidence = {
        ...facts(state, queue, [digit]),
        kind: 'coloring',
        mode,
        colors,
        links: links.filter(({ cells }) => cells.every((cell) => assignments.has(cell))),
      }
      const step = deduction(state, 'simple-coloring', evidence, targets, [digit])
      if (step) {
        return { status: 'complete', step }
      }
    }
  }
  return { status: 'complete', step: null }
}

const detectors = {
  'naked-triple': (state: LogicalState, budget: WorkBudget) => subsets(state, false, budget),
  'hidden-triple': (state: LogicalState, budget: WorkBudget) => subsets(state, true, budget),
  'x-wing': (state: LogicalState, budget: WorkBudget) => fish(state, 2, budget),
  swordfish: (state: LogicalState, budget: WorkBudget) => fish(state, 3, budget),
  'xy-wing': wings,
  'simple-coloring': coloring,
} satisfies Record<AdvancedTechnique, (state: LogicalState, budget: WorkBudget) => StepOutcome>

export function findAdvancedStep(
  state: LogicalState,
  technique: Technique,
  budget: WorkBudget,
): StepOutcome {
  if (!consumeWork(budget)) {
    return { status: 'budget-exhausted' }
  }
  if (
    !isAdvancedTechnique(technique) ||
    (state.context && state.context.rules.kind !== 'classic')
  ) {
    return { status: 'complete', step: null }
  }
  return detectors[technique](state, budget)
}

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
