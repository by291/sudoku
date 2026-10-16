import assert from 'node:assert/strict'
import { gzipSync, gunzipSync } from 'node:zlib'
import { readFileSync, writeFileSync, unlinkSync, readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { sha256, verifyReference } from './freeze-reference.mjs'
import { fixtureRoot } from './suites.mjs'

for (const family of ['full', 'targeted', 'feedback', 'hard058']) {
  const file = resolve(fixtureRoot, `generation-v11-${family}.jsonl`)
  if (existsSync(file)) {
    writeFileSync(file + '.gz', gzipSync(readFileSync(file), { level: 9 }))
    unlinkSync(file)
  }
}
const manifestPath = resolve(fixtureRoot, 'manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
assert.deepStrictEqual(verifyReference(), manifest.reference)
manifest.patch = ['reference-loader.mjs', 'v11-random.ts'].map((file) => ({
  file,
  sha256: sha256(readFileSync(new URL(file, import.meta.url))),
}))
let checkedPuzzles = 0
let checkedTraceSteps = 0
manifest.fixtures = readdirSync(fixtureRoot)
  .filter((file) => file !== 'manifest.json')
  .sort()
  .map((file) => {
    const stored = readFileSync(resolve(fixtureRoot, file))
    const bytes = file.endsWith('.gz') ? gunzipSync(stored) : stored
    const rows = file.endsWith('.gz')
      ? bytes
          .toString('utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
      : JSON.parse(bytes.toString('utf8'))
    if (file.startsWith('generation-v11-')) {
      for (const row of rows) {
        if (row.expected.result.status !== 'ready') {
          continue
        }
        const solution = row.expected.result.puzzle.solution
        for (const step of row.expected.assessment.result.trace) {
          if (step.kind === 'placement') {
            assert.equal(step.digit, solution[step.cell], row.id)
          } else {
            assert.ok(
              step.removals.every((removal) => removal.digit !== solution[removal.cell]),
              row.id,
            )
          }
          checkedTraceSteps++
        }
        checkedPuzzles++
      }
    }
    return {
      file,
      sha256: sha256(bytes),
      bytes: bytes.length,
      cases: Array.isArray(rows) ? rows.length : undefined,
    }
  })
assert.equal(
  manifest.fixtures
    .filter((row) => row.file.startsWith('generation-v11-'))
    .reduce((sum, row) => sum + row.cases, 0),
  2241,
)
manifest.knownSolutionChecks = { puzzles: checkedPuzzles, traceSteps: checkedTraceSteps }
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(`Sealed ${manifest.fixtures.length} fixture files; 2241 generation contracts`)
