import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { loadEngine } from './reference-loader.mjs'
import { fixtureRoot } from './suites.mjs'

const engine = await loadEngine({ v11: true })
const rows = []
for (const family of ['full', 'targeted', 'feedback', 'hard058']) {
  const contracts = gunzipSync(
    readFileSync(resolve(fixtureRoot, `generation-v11-${family}.jsonl.gz`)),
  )
    .toString('utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  for (const row of contracts) {
    assert.equal(row.expected.result.status, 'ready')
    const puzzle = row.expected.result.puzzle
    const budget = engine.createWorkBudget(4000000)
    const result = engine.assessPuzzleWithBudget(
      engine.createAssessmentInput(puzzle.givens, puzzle.rules),
      budget,
    )
    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(result)),
      row.expected.assessment.budgeted,
      row.id,
    )
    rows.push({ id: row.id, workUsed: budget.used })
    if (rows.length % 128 === 0)
      console.log(`Verified generated assessment work: ${rows.length}/2241`)
  }
}
assert.equal(rows.length, 2241)
writeFileSync(
  resolve(fixtureRoot, 'generated-assessment-work.json'),
  JSON.stringify(rows, null, 2) + '\n',
)
console.log('Captured 2241 standalone assessment work counts; all sealed full traces unchanged')
