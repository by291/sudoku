import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadEngine } from './reference-loader.mjs'
import { referenceRoot } from './freeze-reference.mjs'
import { fixtureRoot } from './suites.mjs'

const engine = await loadEngine({ v11: true })
const { prepareConstraintSupport } = await import(
  pathToFileURL(resolve(referenceRoot, 'src/core/sudoku/constraints/support.ts')).href
)
const { ARROW_REPEAT_BOARD, ARROW_REPEAT_RULES } = await import(
  pathToFileURL(resolve(referenceRoot, 'tests/fixtures/variants.ts')).href
)

function killer(cells, sum) {
  return {
    kind: 'killer',
    cages: [
      { cells, sum },
      ...Array.from({ length: 81 }, (_, cell) => cell)
        .filter((cell) => !cells.includes(cell))
        .map((cell) => ({ cells: [cell], sum: 1 })),
    ],
  }
}

const specifications = [
  { id: 'pair', rules: killer([1, 0], 3) },
  { id: 'triple', rules: killer([0, 1, 2], 6) },
  { id: 'quad', rules: killer([0, 1, 2, 3], 20) },
  { id: 'large', rules: killer([0, 1, 2, 3, 4], 15) },
  { id: 'arrow-repeat', rules: ARROW_REPEAT_RULES, board: ARROW_REPEAT_BOARD },
  { id: 'thermo', rules: { kind: 'thermo', paths: [[0, 10, 20]] } },
]
const rows = []
for (const spec of specifications) {
  for (const capacity of [0, 1, 2, 287, 288, 512]) {
    for (const queryLimit of [0, 1, 4, 100000]) {
      const limits = {
        maxTuplesPerConstraint: capacity,
        maxTuplesPerLayout: capacity === 2 ? 3 : 8192,
      }
      const context = engine.compileRules(spec.rules)
      const prepareBudget = engine.createWorkBudget(100000)
      const prepared = prepareConstraintSupport(context, prepareBudget, limits)
      assert.equal(prepared.status, 'ready')
      const queryBudget = engine.createWorkBudget(queryLimit)
      const board = spec.board ?? Array(81).fill(0)
      const domains = Array(81).fill(511)
      const result = prepared.support.get(board, domains, context.constraints[0], queryBudget)
      rows.push({
        id: `${spec.id}:${capacity}:${queryLimit}`,
        input: {
          rules: spec.rules,
          board,
          domains,
          limits,
          queryLimit,
          prepareLimit: 100000,
          index: 0,
        },
        expected: { result, prepareWork: prepareBudget.used, queryWork: queryBudget.used },
      })
    }
  }
}
for (const profile of [
  [[1], [2, 3], [2, 3]],
  [[1, 2], [1, 2], [3]],
  [[2], [2], [2]],
  [
    [1, 2, 3],
    [1, 2, 3],
    [1, 2, 3],
  ],
]) {
  const rules = killer([0, 1, 2], 6)
  const domains = Array(81).fill(511)
  profile.forEach((digits, index) => {
    domains[index] = digits.reduce((mask, digit) => mask | (1 << (digit - 1)), 0)
  })
  const context = engine.compileRules(rules)
  const prepareBudget = engine.createWorkBudget(100000)
  const prepared = prepareConstraintSupport(context, prepareBudget)
  assert.equal(prepared.status, 'ready')
  const queryBudget = engine.createWorkBudget(100000)
  const board = Array(81).fill(0)
  const result = prepared.support.get(board, domains, context.constraints[0], queryBudget)
  rows.push({
    id: `domain-profile:${rows.length}`,
    input: {
      rules,
      board,
      domains,
      limits: { maxTuplesPerConstraint: 512, maxTuplesPerLayout: 8192 },
      queryLimit: 100000,
      prepareLimit: 100000,
      index: 0,
    },
    expected: { result, prepareWork: prepareBudget.used, queryWork: queryBudget.used },
  })
}
writeFileSync(resolve(fixtureRoot, 'support.json'), JSON.stringify(rows, null, 2) + '\n')
console.log(`Independent prepared support: ${rows.length} fixtures`)
