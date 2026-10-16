import { deriveSeed } from '../migration/v11-random'
import { test, expect } from '@playwright/test'
import { createServer } from 'vite'
import type { ViteDevServer } from 'vite'
import type { EngineInfo } from '@sudoku/wasm'
import { uniqueBoard } from '../fixtures/sudoku'

let server: ViteDevServer
let origin: string

test.beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: process.cwd(),
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'error',
    optimizeDeps: { entries: ['tests/migration/wasm-smoke.html'] },
  })
  await server.listen()
  const address = server.httpServer?.address()
  if (!address || typeof address === 'string') {
    throw new Error('The WASM fixture server did not open a port')
  }
  origin = `http://127.0.0.1:${address.port}`
})

test.afterAll(async () => {
  await server?.close()
})

test('loads the generated WASM library and reports typed algorithm identities', async ({
  page,
}) => {
  await page.goto(`${origin}/tests/migration/wasm-smoke.html`)

  const info: unknown = await page.evaluate(async () => {
    const url = '/packages/sudoku-wasm/pkg/sudoku_wasm.js'
    const module: unknown = await import(url)
    if (
      !module ||
      typeof module !== 'object' ||
      !('default' in module) ||
      typeof module.default !== 'function' ||
      !('engine_info' in module) ||
      typeof module.engine_info !== 'function'
    ) {
      throw new Error('Missing generated WASM initialization or engine_info export')
    }
    await module.default()
    const info: unknown = module.engine_info()
    return info
  })

  const expected: EngineInfo = {
    bridgeVersion: 2,
    puzzleVersion: 'sudoku-v11',
    variantPuzzleVersion: 'sudoku-variants-v11',
    ratingVersion: 'sudoku-rating-v2',
  }
  expect(info).toEqual(expected)
})

test('summary assessment preserves full outcomes and work in the browser', async ({ page }) => {
  await page.goto(`${origin}/tests/migration/wasm-smoke.html`)

  const comparisons = await page.evaluate(async (board) => {
    const url = '/packages/sudoku-wasm/pkg/sudoku_wasm.js'
    const bindings: unknown = await import(url)
    function record(value: unknown): value is Record<string, unknown> {
      return value !== null && typeof value === 'object'
    }
    if (
      !record(bindings) ||
      typeof bindings.default !== 'function' ||
      typeof bindings.assess !== 'function' ||
      typeof bindings.assess_summary !== 'function'
    ) {
      throw new Error('Missing assessment bindings')
    }
    await bindings.default()
    const assess = bindings.assess
    const assessSummary = bindings.assess_summary
    const empty = Array(81).fill(0)
    const duplicate = [...empty]
    duplicate[0] = 1
    duplicate[1] = 1
    const requests = [
      { board, rules: { kind: 'classic' } },
      { board: empty, rules: { kind: 'classic' } },
      { board: duplicate, rules: { kind: 'classic' } },
      { board, rules: { kind: 'classic' }, maxWork: 0 },
      { board, rules: { kind: 'diagonal' }, maxWork: 0 },
    ]
    return requests.map((input) => {
      const full: unknown = assess(input)
      const summary: unknown = assessSummary(input)
      if (!record(full) || !record(full.result) || !record(summary) || !record(summary.result)) {
        throw new Error('Malformed assessment output')
      }
      const expected =
        full.result.status === 'rated'
          ? { result: { status: 'rated', summary: full.result.summary }, workUsed: full.workUsed }
          : full
      return { expected, summary, status: summary.result.status }
    })
  }, uniqueBoard)

  expect(comparisons.map((row) => row.status)).toEqual([
    'rated',
    'ungraded',
    'invalid',
    'budget-exhausted',
    'budget-exhausted',
  ])
  for (const row of comparisons) {
    expect(row.summary).toEqual(row.expected)
    expect(row.summary).not.toHaveProperty('result.trace')
  }
})

test('rejects_text_wrong_seed_lengths_and_v10_requests', async ({ page }) => {
  await page.goto(`${origin}/tests/migration/wasm-smoke.html`)

  const rejections = await page.evaluate(async () => {
    const url = '/packages/sudoku-wasm/pkg/sudoku_wasm.js'
    const module: unknown = await import(url)
    if (
      !module ||
      typeof module !== 'object' ||
      !('default' in module) ||
      typeof module.default !== 'function'
    ) {
      throw new Error('Missing generated WASM initializer')
    }
    await module.default()
    if (
      !('generate' in module) ||
      typeof module.generate !== 'function' ||
      !('derive_seed' in module) ||
      typeof module.derive_seed !== 'function'
    ) {
      throw new Error('Missing byte-only generation or derivation export')
    }
    const generate = module.generate
    const derive = module.derive_seed
    const options = {
      variant: 'classic',
      difficulty: 'easy',
      puzzleVersion: 'sudoku-v11',
      limits: { maxLayouts: 40, maxWork: 4000000, maxSteps: 500 },
    }
    const rejected: boolean[] = []
    for (const seed of [
      '0'.repeat(32),
      Array(32).fill(0),
      new Uint8Array(0),
      new Uint8Array(31),
      new Uint8Array(33),
      new Uint8ClampedArray(32),
    ]) {
      try {
        generate(seed, options)
        rejected.push(false)
      } catch {
        rejected.push(true)
      }
    }
    try {
      generate(new Uint8Array(32), { ...options, puzzleVersion: 'sudoku-v10' })
      rejected.push(false)
    } catch {
      rejected.push(true)
    }
    try {
      derive('not bytes')
      rejected.push(false)
    } catch {
      rejected.push(true)
    }
    return rejected
  })

  expect(rejections).toEqual(Array(8).fill(true))
})

test('preserves_all_32_seed_bytes_and_hex_output', async ({ page }) => {
  await page.goto(`${origin}/tests/migration/wasm-smoke.html`)

  const results = await page.evaluate(async () => {
    const url = '/packages/sudoku-wasm/pkg/sudoku_wasm.js'
    const module: unknown = await import(url)
    if (
      !module ||
      typeof module !== 'object' ||
      !('default' in module) ||
      typeof module.default !== 'function'
    ) {
      throw new Error('Missing generated WASM initializer')
    }
    await module.default()
    if (!('generate' in module) || typeof module.generate !== 'function') {
      throw new Error('Missing byte generation export')
    }
    const generate = module.generate
    const outputs: { expected: string; actual: unknown }[] = []
    const seeds = [
      new Uint8Array(32),
      Uint8Array.from({ length: 32 }, (_, index) => index),
      new Uint8Array(32).fill(255),
      Uint8Array.from({ length: 32 }, (_, index) => [255, 192, 128, 239][index % 4]),
    ]
    for (const seed of seeds) {
      const expected = Array.from(seed, (byte) => byte.toString(16).padStart(2, '0')).join('')
      const generated: unknown = generate(seed, {
        variant: 'classic',
        difficulty: 'easy',
        puzzleVersion: 'sudoku-v11',
      })
      if (
        !generated ||
        typeof generated !== 'object' ||
        !('status' in generated) ||
        generated.status !== 'ready' ||
        !('puzzle' in generated) ||
        !generated.puzzle ||
        typeof generated.puzzle !== 'object' ||
        !('seed' in generated.puzzle)
      ) {
        throw new Error('Byte-seeded generation did not return a ready puzzle')
      }
      seed.fill(7)
      outputs.push({ expected, actual: generated.puzzle.seed })
    }
    return outputs
  })

  for (const result of results) {
    expect(result.actual).toBe(result.expected)
  }
})

test('returned_arrays_do_not_alias_prepared_state', async ({ page }) => {
  await page.goto(`${origin}/tests/migration/wasm-smoke.html`)

  const result = await page.evaluate(async () => {
    const url = '/packages/sudoku-wasm/pkg/sudoku_wasm.js'
    const module: unknown = await import(url)
    if (
      !module ||
      typeof module !== 'object' ||
      !('default' in module) ||
      typeof module.default !== 'function'
    ) {
      throw new Error('Missing initializer')
    }
    await module.default()
    if (!('PreparedPuzzle' in module) || typeof module.PreparedPuzzle !== 'function') {
      throw new Error('Missing prepared resource')
    }
    const prepared: unknown = Reflect.construct(module.PreparedPuzzle, [
      { rules: { kind: 'classic' } },
    ])
    if (
      !prepared ||
      typeof prepared !== 'object' ||
      !('metadata' in prepared) ||
      typeof prepared.metadata !== 'function' ||
      !('candidates' in prepared) ||
      typeof prepared.candidates !== 'function' ||
      !('free' in prepared) ||
      typeof prepared.free !== 'function'
    ) {
      throw new Error('Missing resource methods')
    }
    const first: unknown = prepared.metadata()
    if (
      !first ||
      typeof first !== 'object' ||
      !('units' in first) ||
      !Array.isArray(first.units) ||
      !first.units[0] ||
      typeof first.units[0] !== 'object' ||
      !('cells' in first.units[0]) ||
      !Array.isArray(first.units[0].cells)
    ) {
      throw new Error('Invalid metadata arrays')
    }
    first.units[0].cells[0] = 80
    const candidates: unknown = prepared.candidates({ board: Array(81).fill(0) })
    if (
      !candidates ||
      typeof candidates !== 'object' ||
      !('result' in candidates) ||
      !candidates.result ||
      typeof candidates.result !== 'object' ||
      !('candidates' in candidates.result) ||
      !Array.isArray(candidates.result.candidates)
    ) {
      throw new Error('Invalid candidate array')
    }
    candidates.result.candidates[0] = 0
    const second: unknown = prepared.metadata()
    const nextCandidates: unknown = prepared.candidates({ board: Array(81).fill(0) })
    prepared.free()
    let disposed = false
    try {
      prepared.metadata()
    } catch {
      disposed = true
    }
    return { second, nextCandidates, disposed }
  })

  expect(result.second).toMatchObject({
    units: expect.arrayContaining([
      expect.objectContaining({ kind: 'row', index: 0, cells: [0, 1, 2, 3, 4, 5, 6, 7, 8] }),
    ]),
  })
  expect(result.nextCandidates).toMatchObject({
    result: { status: 'complete', candidates: Array(81).fill(511) },
  })
  expect(result.disposed).toBe(true)
})

test('preserves_null_absence_number_kinds_and_allocator_reuse', async ({ page }) => {
  await page.goto(`${origin}/tests/migration/wasm-smoke.html`)

  const result: unknown = await page.evaluate(async () => {
    const url = '/tests/migration/browser-compute.mjs'
    const module: unknown = await import(url)
    if (
      !module ||
      typeof module !== 'object' ||
      !('boundaryProbes' in module) ||
      typeof module.boundaryProbes !== 'function'
    ) {
      throw new Error('Missing browser boundary probes')
    }
    return module.boundaryProbes()
  })

  expect(result).toMatchObject({
    thermoComplement: { kind: 'thermo', paths: [[2, 1, 0]] },
    arrowComplementRejected: true,
    plainArrays: true,
    ownership: true,
    validNull: { valid: true },
    missing: { valid: false, issues: ['Contradictory assessment workload'] },
    bigint: { valid: false, issues: ['Invalid assessment workload counts'] },
    absent: { status: 'absent' },
    unsupported: {
      status: 'present',
      value: { status: 'unavailable', reason: 'unsupported-version' },
    },
    rejected: Array(5).fill(true),
    rejectedLayouts: 2200,
  })
  if (
    !result ||
    typeof result !== 'object' ||
    !('before' in result) ||
    typeof result.before !== 'number' ||
    !('after' in result) ||
    typeof result.after !== 'number'
  ) {
    throw new Error('Missing memory observations')
  }
  expect(result.after - result.before).toBeLessThanOrEqual(65536)
})

test('root_seed_derivation_matches_independent_blake3_bytes', async ({ page }) => {
  await page.goto(`${origin}/tests/migration/wasm-smoke.html`)
  const materials = [
    [],
    [0, 255, 192, 128, 239],
    Array.from(new TextEncoder().encode('daily:2026-10-16')),
  ]
  const actual: unknown = await page.evaluate(async (materials) => {
    const url = '/packages/sudoku-wasm/pkg/sudoku_wasm.js'
    const module: unknown = await import(url)
    if (
      !module ||
      typeof module !== 'object' ||
      !('default' in module) ||
      typeof module.default !== 'function' ||
      !('derive_seed' in module) ||
      typeof module.derive_seed !== 'function'
    ) {
      throw new Error('Missing byte derivation export')
    }
    await module.default()
    const derive = module.derive_seed
    return materials.map((material) => {
      const value: unknown = derive(new Uint8Array(material))
      if (!(value instanceof Uint8Array)) {
        throw new Error('Derived seed is not a byte array')
      }
      return Array.from(value)
    })
  }, materials)

  expect(actual).toEqual(
    materials.map((material) => Array.from(deriveSeed(new Uint8Array(material)))),
  )
})
