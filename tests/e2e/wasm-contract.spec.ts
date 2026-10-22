import { resolve } from 'node:path'
import { deriveSeed } from '../support/independentRandom'
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
    resolve: { alias: { '@': resolve(process.cwd(), 'src') } },
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'error',
    optimizeDeps: { entries: ['tests/browser/wasm-smoke.html'] },
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
  await page.goto(`${origin}/tests/browser/wasm-smoke.html`)

  const info: unknown = await page.evaluate(async () => {
    const url = '/sudoku/wasm/pkg/sudoku_wasm.js'
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
    bridgeVersion: 4,
    puzzleVersion: 'sudoku-v12',
    variantPuzzleVersion: 'sudoku-variants-v12',
    ratingVersion: 'sudoku-rating-v2',
  }
  expect(info).toEqual(expected)
})

test('summary assessment preserves full outcomes in the browser', async ({ page }) => {
  await page.goto(`${origin}/tests/browser/wasm-smoke.html`)

  const comparisons = await page.evaluate(async (board) => {
    const url = '/sudoku/wasm/pkg/sudoku_wasm.js'
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
      { board, rules: { kind: 'classic' }, limits: { maxSteps: 0 } },
      { board: empty, rules: { kind: 'diagonal' }, limits: { maxSteps: 0 } },
    ]
    return requests.map((input) => {
      const full: unknown = assess(input)
      const summary: unknown = assessSummary(input)
      if (!record(full) || !record(full.result) || !record(summary) || !record(summary.result)) {
        throw new Error('Malformed assessment output')
      }
      const expected =
        full.result.status === 'rated'
          ? { result: { status: 'rated', summary: full.result.summary } }
          : full
      return { expected, summary, status: summary.result.status }
    })
  }, uniqueBoard)

  expect(comparisons.map((row) => row.status)).toEqual([
    'rated',
    'ungraded',
    'invalid',
    'incomplete',
    'incomplete',
  ])
  for (const row of comparisons) {
    expect(row.summary).toEqual(row.expected)
    expect(row.summary).not.toHaveProperty('result.trace')
  }
})

test('rejects_text_wrong_seed_lengths_and_v10_requests', async ({ page }) => {
  await page.goto(`${origin}/tests/browser/wasm-smoke.html`)

  const rejections = await page.evaluate(async () => {
    const url = '/sudoku/wasm/pkg/sudoku_wasm.js'
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
      puzzleVersion: 'sudoku-v12',
      limits: { maxLayouts: 40, maxSteps: 500 },
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
  await page.goto(`${origin}/tests/browser/wasm-smoke.html`)

  const results = await page.evaluate(async () => {
    const url = '/sudoku/wasm/pkg/sudoku_wasm.js'
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
        puzzleVersion: 'sudoku-v12',
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
  await page.goto(`${origin}/tests/browser/wasm-smoke.html`)

  const result = await page.evaluate(async () => {
    const url = '/sudoku/wasm/pkg/sudoku_wasm.js'
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
  await page.goto(`${origin}/tests/browser/wasm-smoke.html`)

  const result: unknown = await page.evaluate(async () => {
    const url = '/tests/browser/boundary-probes.mjs'
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
  await page.goto(`${origin}/tests/browser/wasm-smoke.html`)
  const materials = [
    [],
    [0, 255, 192, 128, 239],
    Array.from(new TextEncoder().encode('daily:2026-10-16')),
  ]
  const actual: unknown = await page.evaluate(async (materials) => {
    const url = '/sudoku/wasm/pkg/sudoku_wasm.js'
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

test('edit validates every note mask before length and action failures', async ({ page }) => {
  await page.goto(`${origin}/tests/browser/wasm-smoke.html`)

  const errors = await page.evaluate(async () => {
    const url = '/sudoku/wasm/pkg/sudoku_wasm.js'
    const bindings: unknown = await import(url)
    if (
      !bindings ||
      typeof bindings !== 'object' ||
      !('default' in bindings) ||
      typeof bindings.default !== 'function' ||
      !('PreparedPuzzle' in bindings) ||
      typeof bindings.PreparedPuzzle !== 'function'
    ) {
      throw new Error('Missing prepared puzzle bindings')
    }
    await bindings.default()
    const prepared: unknown = Reflect.construct(bindings.PreparedPuzzle, [
      { rules: { kind: 'classic' } },
    ])
    if (
      !prepared ||
      typeof prepared !== 'object' ||
      !('edit' in prepared) ||
      typeof prepared.edit !== 'function' ||
      !('free' in prepared) ||
      typeof prepared.free !== 'function'
    ) {
      throw new Error('Missing prepared edit methods')
    }
    const errors: string[] = []
    try {
      const cases = [
        { length: 80, invalidMask: true },
        { length: 82, invalidMask: true },
        { length: 80, invalidMask: false },
      ]
      for (const { length, invalidMask } of cases) {
        const notes: number[] = Array(length).fill(0)
        if (invalidMask) {
          // The oversized case validates the extra mask beyond the retained board.
          notes[length - 1] = 512
        }
        try {
          prepared.edit({
            givens: Array(81).fill(0),
            entries: Array(81).fill(0),
            notes,
            action: { kind: 'enter', cell: 81, digit: 0 },
          })
          errors.push('accepted invalid edit')
        } catch (error) {
          if (!(error instanceof Error)) {
            throw error
          }
          errors.push(error.message)
        }
      }
    } finally {
      prepared.free()
    }
    return errors
  })

  expect(errors).toEqual([
    'Invalid nine-digit mask: 512',
    'Invalid nine-digit mask: 512',
    'Notes require exactly 81 masks',
  ])
})

test('assessment technique coverage precedes count and workload contradictions', async ({
  page,
}) => {
  await page.goto(`${origin}/tests/browser/wasm-smoke.html`)

  const outcomes = await page.evaluate(async (board) => {
    const url = '/sudoku/wasm/pkg/sudoku_wasm.js'
    const bindings: unknown = await import(url)
    function record(value: unknown): value is Record<string, unknown> {
      return value !== null && typeof value === 'object'
    }
    if (
      !record(bindings) ||
      typeof bindings.default !== 'function' ||
      typeof bindings.assess_summary !== 'function' ||
      typeof bindings.parse_assessment_summary !== 'function'
    ) {
      throw new Error('Missing assessment summary bindings')
    }
    await bindings.default()
    const assessed: unknown = bindings.assess_summary({ board, rules: { kind: 'classic' } })
    if (
      !record(assessed) ||
      !record(assessed.result) ||
      assessed.result.status !== 'rated' ||
      !record(assessed.result.summary)
    ) {
      throw new Error('Missing rated summary fixture')
    }
    const summary = assessed.result.summary
    const workload = summary.workload
    if (!record(workload)) {
      throw new Error('Missing workload fixture')
    }
    const counts = workload.techniqueCounts
    if (!record(counts)) {
      throw new Error('Missing technique count fixture')
    }
    const [firstKey, secondKey] = Object.keys(counts)
    if (!firstKey || !secondKey) {
      throw new Error('Missing technique counts')
    }
    const withoutFirst = { ...counts }
    delete withoutFirst[firstKey]
    const missing = { ...withoutFirst, [secondKey]: -1 }
    const unknownKey = { ...withoutFirst, 'unknown-technique': 0 }
    const invalidCount = { ...counts, [firstKey]: -1 }
    const parse = bindings.parse_assessment_summary
    return [missing, unknownKey, invalidCount].map((techniqueCounts) =>
      parse({
        ...summary,
        workload: { ...workload, techniqueCounts, highestTechnique: null, highestTier: null },
      }),
    )
  }, uniqueBoard)

  expect(outcomes).toEqual([
    {
      valid: false,
      issues: ['Assessment technique counts must include every known technique'],
    },
    { valid: false, issues: ['Invalid or inapplicable assessment technique count'] },
    { valid: false, issues: ['Invalid or inapplicable assessment technique count'] },
  ])
})

test('live assessment preserves typed violations and rejects malformed diagnostics in the browser', async ({
  page,
}) => {
  await page.goto(`${origin}/tests/browser/wasm-smoke.html`)

  const outcomes = await page.evaluate(async () => {
    const url = '/sudoku/wasm/pkg/sudoku_wasm.js'
    const bindings: unknown = await import(url)
    function record(value: unknown): value is Record<string, unknown> {
      return value !== null && typeof value === 'object'
    }
    if (
      !record(bindings) ||
      typeof bindings.default !== 'function' ||
      typeof bindings.assess !== 'function' ||
      typeof bindings.parse_live_assessment_outcome !== 'function' ||
      typeof bindings.parse_assessment_outcome !== 'function'
    ) {
      throw new Error('Missing live assessment bindings')
    }
    await bindings.default()
    const cases = [
      {
        rules: { kind: 'classic' },
        filled: [
          [0, 1],
          [1, 1],
        ],
      },
      {
        rules: {
          kind: 'killer',
          cages: [
            { cells: [1, 0], sum: 3 },
            ...Array.from({ length: 79 }, (_, index) => ({ cells: [index + 2], sum: 1 })),
          ],
        },
        filled: [
          [0, 8],
          [1, 9],
        ],
      },
      {
        rules: { kind: 'thermo', paths: [[10, 1, 0]] },
        filled: [
          [0, 1],
          [1, 2],
          [10, 3],
        ],
      },
      {
        rules: { kind: 'arrow', arrows: [{ circle: 10, shaft: [1, 0] }] },
        filled: [
          [0, 1],
          [1, 2],
          [10, 5],
        ],
      },
    ]
    const assess = bindings.assess
    const facts = cases.map(({ rules, filled }) => {
      const board = Array(81).fill(0)
      for (const [cell, digit] of filled) {
        board[cell] = digit
      }
      const assessed: unknown = assess({ board, rules })
      if (!record(assessed) || !record(assessed.result)) {
        throw new Error('Missing live assessment result')
      }
      return assessed.result
    })
    const parse = bindings.parse_live_assessment_outcome
    const throwingIssue = Object.defineProperty({ kind: 'message' }, 'message', {
      get() {
        throw new Error('getter')
      },
    })
    const invalid = [
      { status: 'invalid', issues: ['historical text'] },
      { status: 'invalid', issues: [throwingIssue] },
      {
        status: 'invalid',
        issues: [
          {
            kind: 'violation',
            violation: {
              constraintId: 'cage:0',
              cells: [0],
              code: { kind: 'cage-total', index: 0, sum: 65536 },
            },
          },
        ],
      },
      {
        status: 'incomplete',
        ratingVersion: 'sudoku-rating-v2',
        variant: 'classic',
        stage: 'validation',
      },
    ].map((value) => parse(value))
    return {
      facts,
      invalid,
      historical: bindings.parse_assessment_outcome({
        status: 'invalid',
        issues: ['historical text'],
      }),
    }
  })

  expect(outcomes.facts[0]).toEqual({
    status: 'invalid',
    issues: [
      {
        kind: 'violation',
        violation: { constraintId: 'row:0', cells: [0, 1], code: { kind: 'duplicate' } },
      },
      {
        kind: 'violation',
        violation: { constraintId: 'box:0', cells: [0, 1], code: { kind: 'duplicate' } },
      },
    ],
  })
  const expected = [
    { constraintId: 'cage:0', cells: [1, 0], code: { kind: 'cage-total', index: 0, sum: 3 } },
    { constraintId: 'thermo:0', cells: [10, 1, 0], code: { kind: 'thermo-order', index: 0 } },
    { constraintId: 'arrow:0', cells: [10, 1, 0], code: { kind: 'arrow-total', index: 0 } },
  ]
  for (const [index, violation] of expected.entries()) {
    expect(outcomes.facts[index + 1]).toMatchObject({
      status: 'invalid',
      issues: expect.arrayContaining([{ kind: 'violation', violation }]),
    })
  }
  for (const result of outcomes.invalid) {
    expect(result).toMatchObject({ valid: false })
  }
  expect(outcomes.historical).toEqual({
    valid: true,
    value: { status: 'invalid', issues: ['historical text'] },
  })
})
