// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { expect, it, vi } from 'vitest'
import {
  verifyThenMeasure,
  BenchmarkPhases,
  requireEmittedWasm,
} from '../benchmarks/sudoku-core/contracts.mjs'

it('rejects_a_payload_mismatch_before_timing', () => {
  const clock = vi.fn(() => 0)

  expect(() => verifyThenMeasure(() => ({ count: 2 }), { count: 1 }, clock)).toThrow(/mismatch/)
  expect(clock).not.toHaveBeenCalled()
  const entry = new URL('../benchmarks/sudoku-core/contracts.mjs', import.meta.url).href
  const child = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { verifyThenMeasure } from ${JSON.stringify(entry)}; verifyThenMeasure(() => ({ count: 2 }), { count: 1 })`,
    ],
    { encoding: 'utf8' },
  )
  expect(child.status).not.toBe(0)
  expect(child.stderr).toContain('Benchmark payload mismatch')
})

it('does_not_time_setup_or_overlap_external_checks', async () => {
  let time = 0
  const phases = new BenchmarkPhases()
  await phases.externalCheck(async () => {
    time += 100
  })
  phases.ready()
  const sampled = phases.measure(() => {
    expect(() => phases.externalCheck(async () => {})).toThrow(/measurement/)
    return verifyThenMeasure(
      () => {
        time += 3
        return { count: 1 }
      },
      { count: 1 },
      () => time,
    )
  })

  expect(sampled.durationMs).toBe(3)
  expect(() => phases.externalCheck(async () => {})).toThrow(/setup/)
})

it('requires_real_emitted_wasm_at_both_roots', () => {
  const valid = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])

  for (const base of ['/', '/sudoku/']) {
    expect(requireEmittedWasm(`${base}assets/engine.wasm`, valid, base)).toBe(true)
    expect(() => requireEmittedWasm('/src/engine.wasm', valid, base)).toThrow(/emitted/)
    expect(() =>
      requireEmittedWasm(`${base}assets/engine.wasm`, new Uint8Array([1, 2]), base),
    ).toThrow(/WASM/)
  }
  expect(() => requireEmittedWasm('/assets/engine.wasm', valid, '/sudoku/')).toThrow(/emitted/)
})

it('rejects_incomplete_interactive_and_instance_lifecycle_evidence', async () => {
  const contracts = await import('../benchmarks/sudoku-core/contracts.mjs')

  expect(() => contracts.requireInteractiveCoverage([])).toThrow(/coverage/)
  expect(() => contracts.requireLifecycleEvidence({ allocatorStable: true })).toThrow(/lifecycle/)
})

it('resource_observation_counts_the_browser_process_tree_only', async () => {
  const { processTreeBytes } = await import('../benchmarks/sudoku-core/resource-observer.mjs')
  const snapshot = '10 1 100\n11 10 200\n12 11 300\n90 1 9000\n'

  expect(processTreeBytes(snapshot, 10)).toBe(600 * 1024)
  expect(() => processTreeBytes(snapshot, 99)).toThrow(/process/)
})
