import { computeScreening } from './reference-assessment.mjs'
import { gzipSync } from 'node:zlib'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEngine } from './reference-loader.mjs'
import { fixtureRoot } from './suites.mjs'

const engine = await loadEngine({ v11: true })
const authored = JSON.parse(readFileSync(resolve(fixtureRoot, 'assessment.json'), 'utf8'))
const limits = { maxSteps: 500, maxWork: 4000000 }
const compute = (input) => computeScreening(engine, input)

const rows = []
for (const row of authored) {
  for (const prepared of [false, true]) {
    for (const mode of ['assess', 'screen', 'target']) {
      const targets = mode === 'target' ? ['easy', 'medium', 'hard'] : [null]
      if (mode === 'target' && row.input.rules.kind === 'classic') targets.push('expert')
      for (const target of targets) {
        const base = {
          board: row.input.board,
          rules: row.input.rules,
          limits,
          prepared,
          mode,
          target,
          workLimit: 4000000,
          initialWork: 0,
          repeats: 1,
        }
        const full = compute(base)
        for (const workLimit of new Set([0, 1, Math.max(0, full.used - 1), full.used, 4000000])) {
          const input = { ...base, workLimit, repeats: 2 }
          if (workLimit >= 3) input.initialWork = 3
          // Capture exact boundaries without consuming initial work, then separately probe aggregate reuse.
          if (workLimit === full.used || workLimit === full.used - 1) input.initialWork = 0
          rows.push({
            id: `${row.id}:${prepared}:${mode}:${target}:${workLimit}`,
            input,
            expected: compute(input),
          })
        }
      }
    }
    for (const maxSteps of [0, Math.max(0, row.expected.result.trace.length - 1)]) {
      const input = {
        board: row.input.board,
        rules: row.input.rules,
        limits: { ...limits, maxSteps },
        prepared,
        mode: 'assess',
        target: null,
        workLimit: 4000000,
        initialWork: 0,
        repeats: 1,
      }
      rows.push({ id: `${row.id}:${prepared}:steps:${maxSteps}`, input, expected: compute(input) })
    }
  }
}
const solved = authored[0].input.solution
for (const spec of [
  { id: 'completed-zero-limits', board: solved, limits: { maxSteps: 0, maxWork: 0 }, workLimit: 0 },
  { id: 'empty-ungraded', board: Array(81).fill(0) },
  { id: 'conflicting', board: solved.map((digit, cell) => (cell === 0 ? solved[1] : digit)) },
  { id: 'oversized-caller-budget', board: authored[0].input.board, workLimit: 4000001 },
]) {
  const input = {
    rules: { kind: 'classic' },
    limits,
    prepared: false,
    mode: 'assess',
    target: null,
    workLimit: 4000000,
    initialWork: 0,
    repeats: 1,
    ...spec,
  }
  delete input.id
  rows.push({ id: spec.id, input, expected: compute(input) })
}
writeFileSync(
  resolve(fixtureRoot, 'assessment-screening.jsonl.gz'),
  gzipSync(rows.map((row) => JSON.stringify(row)).join('\n') + '\n', { level: 9 }),
)
console.log(`Captured ${rows.length} assessment and target-screening probes`)
