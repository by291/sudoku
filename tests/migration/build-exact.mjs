import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadEngine } from './reference-loader.mjs'
import { referenceRoot } from './freeze-reference.mjs'
import { fixtureRoot } from './suites.mjs'

const engine = await loadEngine({ v11: true })
const { referenceCountSolutions } = await import(
  pathToFileURL(resolve(referenceRoot, 'tests/support/referenceVariants.ts')).href
)
const boards = JSON.parse(readFileSync(resolve(fixtureRoot, 'exact-inputs.json'), 'utf8'))
const rows = []
for (const board of boards) {
  const setup = engine.createWorkBudget(4000000)
  const prepared = engine.prepareRuleComputation(board.rules, setup)
  assert.equal(prepared.status, 'ready')
  const validator = engine.prepareExactValidator(prepared.computation)
  const counted = referenceCountSolutions(board.board, board.rules)
  for (const [index, probe] of board.probes.entries()) {
    const budget = engine.createWorkBudget(probe.workLimit)
    budget.used = probe.initialWork
    const result = validator.count(board.board, budget, probe.nodeLimit)
    assert.deepStrictEqual(result, probe.expected, board.id)
    if (result.status === 'complete') {
      assert.equal(result.count, counted.count, board.id)
      if (result.count === 1) assert.deepStrictEqual(result.solution, counted.solution, board.id)
    }
    rows.push({
      id: `${board.id}:${index}`,
      input: {
        board: board.board,
        rules: board.rules,
        workLimit: probe.workLimit,
        nodeLimit: probe.nodeLimit,
        initialWork: probe.initialWork,
      },
      expected: { result, used: budget.used },
    })
  }
}
assert.equal(rows.length, 1320)
writeFileSync(resolve(fixtureRoot, 'exact-prepared.json'), JSON.stringify(rows, null, 2) + '\n')
console.log('Independent prepared exact: 220 boards / 1320 probes')
