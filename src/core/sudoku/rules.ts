import { BOARD_SIZE, BOX_SIZE, UNIT_SIZE, isRecord } from '@/core/sudoku/types'
import type { Board, ParseResult } from '@/core/sudoku/types'

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
  rules: PuzzleRules
  units: readonly SudokuUnit[]
  duplicatePeers: readonly (readonly number[])[]
  relatedCells: readonly (readonly number[])[]
  constraints: readonly RuleConstraint[]
}
export const CLASSIC_RULES: PuzzleRules = { kind: 'classic' }

export function isSudokuVariant(value: unknown): value is SudokuVariant {
  return SUDOKU_VARIANTS.some((variant) => variant === value)
}
function cellIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < BOARD_SIZE
}
function cells(value: unknown, minimum: number, maximum: number): number[] | null {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) return null
  const result: number[] = []
  for (const entry of value) {
    const candidate: unknown = entry
    if (!cellIndex(candidate) || result.includes(candidate)) return null
    result.push(candidate)
  }
  return result
}
export function cellsTouch(first: number, second: number, diagonal: boolean): boolean {
  const rowDistance = Math.abs(Math.floor(first / UNIT_SIZE) - Math.floor(second / UNIT_SIZE))
  const columnDistance = Math.abs((first % UNIT_SIZE) - (second % UNIT_SIZE))
  return diagonal ? Math.max(rowDistance, columnDistance) === 1 : rowDistance + columnDistance === 1
}
function connected(region: readonly number[]): boolean {
  const reached = new Set([region[0]])
  const pending = [region[0]]
  while (pending.length) {
    const current = pending.pop()
    if (current === undefined) break
    for (const cell of region) {
      if (reached.has(cell) || !cellsTouch(current, cell, false)) continue
      reached.add(cell)
      pending.push(cell)
    }
  }
  return reached.size === region.length
}
function partition(regions: readonly (readonly number[])[]): boolean {
  const flattened = regions.flat()
  return flattened.length === BOARD_SIZE && new Set(flattened).size === BOARD_SIZE
}
function orderedPath(path: readonly number[]): boolean {
  return path.slice(1).every((cell, index) => cellsTouch(path[index], cell, true))
}
export function parseRules(value: unknown): ParseResult<PuzzleRules> {
  const invalid = (reason: string): ParseResult<PuzzleRules> => ({ valid: false, issues: [reason] })
  if (!isRecord(value) || !isSudokuVariant(value.kind)) return invalid('Unknown Sudoku rule type')
  if (value.kind === 'classic' || value.kind === 'diagonal')
    return { valid: true, value: { kind: value.kind } }
  if (value.kind === 'jigsaw') {
    if (!Array.isArray(value.regions) || value.regions.length !== UNIT_SIZE)
      return invalid('Jigsaw requires nine regions')
    const regions: number[][] = []
    for (const raw of value.regions) {
      const region = cells(raw, UNIT_SIZE, UNIT_SIZE)
      if (!region || !connected(region))
        return invalid('Jigsaw regions must contain nine connected cells')
      regions.push(region)
    }
    if (!partition(regions)) return invalid('Jigsaw regions must partition all cells')
    return { valid: true, value: { kind: 'jigsaw', regions } }
  }
  if (value.kind === 'killer') {
    if (!Array.isArray(value.cages) || !value.cages.length) return invalid('Killer requires cages')
    const cages: Cage[] = []
    for (const raw of value.cages) {
      const cage: unknown = raw
      if (!isRecord(cage) || typeof cage.sum !== 'number' || !Number.isInteger(cage.sum))
        return invalid('Invalid cage total')
      const region = cells(cage.cells, 1, UNIT_SIZE)
      if (!region || !connected(region))
        return invalid('Cages must contain connected distinct cells')
      const count = region.length
      if (cage.sum < (count * (count + 1)) / 2 || cage.sum > (count * (19 - count)) / 2)
        return invalid('Cage total is outside distinct digit bounds')
      cages.push({ cells: region, sum: cage.sum })
    }
    if (!partition(cages.map((cage) => cage.cells)))
      return invalid('Cages must partition all cells')
    return { valid: true, value: { kind: 'killer', cages } }
  }
  if (value.kind === 'thermo') {
    if (!Array.isArray(value.paths) || !value.paths.length) return invalid('Thermo requires paths')
    const paths: number[][] = []
    for (const raw of value.paths) {
      const path = cells(raw, 2, UNIT_SIZE)
      if (!path || !orderedPath(path))
        return invalid('Thermo requires adjacent, distinct ordered cells')
      paths.push(path)
    }
    return { valid: true, value: { kind: 'thermo', paths } }
  }
  if (!Array.isArray(value.arrows) || !value.arrows.length) return invalid('Arrow requires clues')
  const arrows: Arrow[] = []
  for (const raw of value.arrows) {
    const arrow: unknown = raw
    if (!isRecord(arrow) || !cellIndex(arrow.circle)) return invalid('Invalid arrow circle')
    const shaft = cells(arrow.shaft, 1, UNIT_SIZE)
    if (!shaft || shaft.includes(arrow.circle) || !orderedPath([arrow.circle, ...shaft]))
      return invalid('Arrow requires adjacent, distinct shaft cells outside its circle')
    arrows.push({ circle: arrow.circle, shaft })
  }
  return { valid: true, value: { kind: 'arrow', arrows } }
}

const classicUnits: readonly SudokuUnit[] = (['row', 'column', 'box'] as const).flatMap((kind) =>
  Array.from({ length: UNIT_SIZE }, (_, index): SudokuUnit => ({
    kind,
    index,
    cells: Array.from({ length: UNIT_SIZE }, (_, offset) =>
      kind === 'row'
        ? index * UNIT_SIZE + offset
        : kind === 'column'
          ? offset * UNIT_SIZE + index
          : Math.floor(index / BOX_SIZE) * BOX_SIZE * UNIT_SIZE +
            (index % BOX_SIZE) * BOX_SIZE +
            Math.floor(offset / BOX_SIZE) * UNIT_SIZE +
            (offset % BOX_SIZE),
    ),
  })),
)
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
  if (constraint.kind === 'thermo')
    return constraint.cells
      .slice(1)
      .every((cell, index) => board[cell] > board[constraint.cells[index]])
  if (constraint.kind === 'arrow')
    return constraint.shaft.reduce((sum, cell) => sum + board[cell], 0) === board[constraint.circle]
  const values = constraint.cells.map((cell) => board[cell])
  return (
    new Set(values).size === values.length &&
    values.reduce<number>((sum, digit) => sum + digit, 0) === constraint.sum
  )
}
export function compileRules(rules: PuzzleRules): RuleContext {
  const parsed = parseRules(rules)
  if (!parsed.valid) throw new TypeError(parsed.issues.join('; '))
  const units = [...classicUnits]
  const constraints: RuleConstraint[] = []
  if (rules.kind === 'jigsaw') {
    units.splice(UNIT_SIZE * 2)
    rules.regions.forEach((region, index) => units.push({ kind: 'region', index, cells: region }))
  }
  if (rules.kind === 'diagonal') {
    units.push({ kind: 'diagonal', index: 0, cells: Array.from({ length: 9 }, (_, i) => i * 10) })
    units.push({
      kind: 'diagonal',
      index: 1,
      cells: Array.from({ length: 9 }, (_, i) => (i + 1) * 8),
    })
  }
  if (rules.kind === 'killer')
    rules.cages.forEach((cage, index) =>
      constraints.push({ ...cage, kind: 'cage', index, id: `cage:${index}` }),
    )
  if (rules.kind === 'thermo')
    rules.paths.forEach((path, index) =>
      constraints.push({ kind: 'thermo', index, id: `thermo:${index}`, cells: path }),
    )
  if (rules.kind === 'arrow')
    rules.arrows.forEach((arrow, index) =>
      constraints.push({ ...arrow, kind: 'arrow', index, id: `arrow:${index}` }),
    )
  const duplicateGroups = units.map((unit) => unit.cells)
  for (const constraint of constraints)
    if (constraint.kind === 'cage') duplicateGroups.push(constraint.cells)
  return {
    rules,
    units,
    constraints,
    duplicatePeers: relationships(duplicateGroups),
    relatedCells: relationships([...duplicateGroups, ...constraints.map(constraintCells)]),
  }
}
export const CLASSIC_CONTEXT = compileRules(CLASSIC_RULES)
