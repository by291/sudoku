import { describe, expect, it } from 'vitest'
import { CLASSIC_CONTEXT, compileRules, parseRules, prepareRuleContext } from '@/core/sudoku/rules'
import { createWorkBudget } from '@/core/sudoku/budget'
import { PEERS, UNITS } from '@/core/sudoku/board'
import { ARROW_REPEAT_RULES } from '../../../tests/fixtures/variants'

const rows = Array.from({ length: 9 }, (_, row) =>
  Array.from({ length: 9 }, (_, col) => row * 9 + col),
)
const singletonCages = Array.from({ length: 81 }, (_, cell) => ({ cells: [cell], sum: 1 }))

describe('rule geometry validation', () => {
  it('preserves Classic units and peer ordering', () => {
    expect(CLASSIC_CONTEXT.units).toEqual(UNITS)
    expect(CLASSIC_CONTEXT.duplicatePeers).toEqual(PEERS)
  })
  it('compiles both full diagonals and replaces Jigsaw boxes', () => {
    expect(compileRules({ kind: 'diagonal' }).units).toHaveLength(29)
    const context = compileRules({ kind: 'jigsaw', regions: rows })

    expect(context.units).toHaveLength(27)
    expect(context.units.some((unit) => unit.kind === 'box')).toBe(false)
    expect(context.units.filter((unit) => unit.kind === 'region')).toHaveLength(9)
  })
  it('separates related arrow cells from duplicate peers', () => {
    const context = compileRules(ARROW_REPEAT_RULES)

    expect(context.relatedCells[16]).toContain(40)
    expect(context.duplicatePeers[16]).not.toContain(40)
    expect(context.constraints[0].id).toBe('arrow:0')
  })
  it('adds cage duplicate peers without treating cages as nine-digit units', () => {
    const cages = [{ cells: [0, 1], sum: 3 }, ...singletonCages.slice(2)]
    const context = compileRules({ kind: 'killer', cages })

    expect(context.units).toHaveLength(27)
    expect(context.constraints).toHaveLength(80)
  })
  it.each([
    { kind: 'unknown' },
    { kind: 'jigsaw', regions: rows.slice(1) },
    { kind: 'jigsaw', regions: rows.map(() => rows[0]) },
    {
      kind: 'jigsaw',
      regions: rows.map((region, i) => (i === 0 ? [0, 1, 2, 3, 4, 5, 6, 7, 80] : region)),
    },
    { kind: 'killer', cages: [{ cells: [0, 2], sum: 3 }, ...singletonCages.slice(3)] },
    {
      kind: 'killer',
      cages: singletonCages.map((cage, i) => (i === 0 ? { ...cage, sum: 1.5 } : cage)),
    },
    { kind: 'killer', cages: [{ cells: [0, 1], sum: 2 }, ...singletonCages.slice(2)] },
    { kind: 'thermo', paths: [] },
    { kind: 'thermo', paths: [[0]] },
    { kind: 'thermo', paths: [[0, 0]] },
    { kind: 'thermo', paths: [[0, 2]] },
    { kind: 'thermo', paths: [[0, 81]] },
    { kind: 'arrow', arrows: [{ circle: 0, shaft: [0, 1] }] },
    { kind: 'arrow', arrows: [{ circle: 0, shaft: [2] }] },
    { kind: 'arrow', arrows: [{ circle: 0, shaft: [] }] },
  ])('rejects malformed partitions, cages, or paths: %j', (rules) => {
    expect(parseRules(rules).valid).toBe(false)
  })
  it('allows shared cells across different paths', () => {
    expect(
      parseRules({
        kind: 'thermo',
        paths: [
          [0, 10],
          [1, 10, 20],
        ],
      }).valid,
    ).toBe(true)
    expect(
      parseRules({
        kind: 'arrow',
        arrows: [
          { circle: 0, shaft: [10] },
          { circle: 1, shaft: [10, 20] },
        ],
      }).valid,
    ).toBe(true)
  })
})

it('owns rule snapshots and compiled memberships', () => {
  const cages = [
    { cells: [0, 1], sum: 3 },
    ...singletonCages.slice(2).map((cage) => ({ ...cage, cells: [...cage.cells] })),
  ]
  const context = compileRules({ kind: 'killer', cages })
  const regions = rows.map((row) => [...row])
  const jigsaw = compileRules({ kind: 'jigsaw', regions })

  cages[0].cells.reverse()
  cages[0].sum = 4
  regions[0].reverse()

  expect(context.rules.kind === 'killer' && context.rules.cages[0]).toEqual({
    cells: [0, 1],
    sum: 3,
  })
  expect(jigsaw.rules.kind === 'jigsaw' && jigsaw.rules.regions[0]).toEqual(rows[0])
  expect(context.cellUnits[0]).toEqual([0, 9, 18])
  expect(context.cellConstraints[0]).toEqual([0])
  expect(context.cellConstraints[1]).toEqual([0])
  expect(context.units).toHaveLength(27)
  expect(Object.isFrozen(context.cellUnits[0])).toBe(true)
})

it('keeps partial topology preparation inconclusive and charged', () => {
  const rules = { kind: 'jigsaw' as const, regions: rows }
  const zero = createWorkBudget(0)
  const partial = createWorkBudget(7)

  expect(prepareRuleContext(rules, zero)).toEqual({ status: 'budget-exhausted' })
  expect(prepareRuleContext(rules, partial)).toEqual({ status: 'budget-exhausted' })
  expect(zero.used).toBe(0)
  expect(partial.used).toBe(7)
  expect(prepareRuleContext(rules, createWorkBudget(100000)).status).toBe('ready')
})
