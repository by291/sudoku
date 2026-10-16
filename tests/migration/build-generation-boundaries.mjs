import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { loadEngine } from './reference-loader.mjs'
import { computeCase, fixtureRoot } from './suites.mjs'

const engine = await loadEngine({ v11: true })
const full = gunzipSync(readFileSync(resolve(fixtureRoot, 'generation-v11-full.jsonl.gz')))
  .toString('utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line))
const selected = new Map()
for (const row of full) {
  const identity = `${row.input.variant}:${row.input.difficulty}`
  if (!selected.has(identity)) selected.set(identity, row)
}
assert.equal(selected.size, 19)
const rows = []
for (const [identity, row] of selected) {
  const defaultLimits = { maxLayouts: 40, maxWork: 4000000, maxSteps: 500 }
  const measuredWork = row.expected.result.metrics.constructionWork
  const specifications = [
    ...[0, 1, 20].map((maxWork) => ({
      name: `work:${maxWork}`,
      limits: { ...defaultLimits, maxWork },
    })),
    { name: 'no-layouts', limits: { ...defaultLimits, maxLayouts: 0 } },
    { name: 'one-layout', limits: { ...defaultLimits, maxLayouts: 1 } },
    { name: 'no-steps', limits: { ...defaultLimits, maxLayouts: 1, maxSteps: 0 } },
    { name: 'one-short', limits: { ...defaultLimits, maxWork: measuredWork - 1 } },
    { name: 'exact', limits: { ...defaultLimits, maxWork: measuredWork } },
  ]
  for (const spec of specifications) {
    const input = { ...row.input, limits: spec.limits }
    rows.push({
      id: `${identity}:${spec.name}`,
      input,
      expected: await computeCase(engine, 'generation', input),
    })
  }
  console.log(`Captured generation boundaries: ${identity}`)
}
writeFileSync(
  resolve(fixtureRoot, 'generation-boundaries.json'),
  JSON.stringify(rows, null, 2) + '\n',
)
console.log(`Captured ${rows.length} bounded generation outcomes`)
