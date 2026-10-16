import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, extname, sep } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import os from 'node:os'
import { observeResources } from './resource-observer.mjs'
import { createServer } from 'vite'
import { chromium, firefox, webkit } from '@playwright/test'
import { loadEngine } from '../../tests/migration/reference-loader.mjs'
import { verifyReference, referenceRoot } from '../../tests/migration/freeze-reference.mjs'
import {
  BenchmarkPhases,
  verifyPayload,
  verifyThenMeasure,
  requireEmittedWasm,
  statistics,
  requireInteractiveCoverage,
  requireLifecycleEvidence,
} from './contracts.mjs'

const args = process.argv.slice(2)
const smoke = args.includes('--smoke')
const argument = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const browserNames = argument('--browsers', 'chromium,firefox,webkit').split(',')
const output = resolve(
  argument(
    '--output',
    smoke
      ? '.superpowers/sdd/2026-10-16-rust-core-and-wasm/benchmark-smoke.json'
      : 'docs/superpowers/verification/2026-10-16-rust-core-migration.json',
  ),
)
const sha = (value) => createHash('sha256').update(value).digest('hex')
const phases = new BenchmarkPhases()
const setup = []
const report = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  smoke,
  host: {
    platform: process.platform,
    architecture: process.arch,
    cpus: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
  },
  node: process.version,
  setup,
  browsers: {},
}
const fixtureRoot = resolve('tests/fixtures/engine-contracts')
const nativePath = resolve(
  'target/release/examples/release_benchmark' + (process.platform === 'win32' ? '.exe' : ''),
)

function command(executable, parameters, options = {}) {
  const result = spawnSync(executable, parameters, {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  })
  if (result.status !== 0)
    throw new Error(
      `${executable} failed (${result.status}): ${result.error?.message ?? result.stderr?.slice(-3000)}`,
    )
  return result
}

async function build(executable, parameters) {
  await phases.externalCheck(async () => {
    const started = performance.now()
    command(executable, parameters)
    setup.push({
      command: [executable, ...parameters],
      durationMs: performance.now() - started,
      completedAt: new Date().toISOString(),
    })
  })
}

function fingerprints() {
  const files = []
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (/\.(?:rs|ts|vue|mjs|mts|toml|html)$/.test(path)) files.push(path)
    }
  }
  for (const directory of ['src', 'crates', 'scripts', 'benchmarks/sudoku-core']) visit(directory)
  for (const file of [
    'Cargo.lock',
    'Cargo.toml',
    'rust-toolchain.toml',
    'pnpm-lock.yaml',
    'package.json',
    'tests/migration/live-profile.ts',
    'tests/fixtures/sudoku.ts',
    'tests/fixtures/variants.ts',
  ])
    files.push(resolve(file))
  const sources = files.sort().map((file) => ({
    file: file
      .slice(process.cwd().length + 1)
      .split(sep)
      .join('/'),
    sha256: sha(readFileSync(file)),
  }))
  return { sha256: sha(JSON.stringify(sources)), sources }
}

function assets(directory, base) {
  const files = readdirSync(resolve(directory, 'assets'))
  const wasm = files.find((name) => /^sudoku_wasm_bg-.*\.wasm$/.test(name))
  const worker = files.find((name) => /^sudoku\.worker-.*\.js$/.test(name))
  if (!wasm || !worker) throw new Error(`Missing emitted production assets at ${base}`)
  const bytes = readFileSync(resolve(directory, 'assets', wasm))
  requireEmittedWasm(`${base}assets/${wasm}`, bytes, base)
  return {
    base,
    directory,
    wasm: `${base}assets/${wasm}`,
    worker: `${base}assets/${worker}`,
    bytes: bytes.length,
    wasmSha256: sha(bytes),
    workerSha256: sha(readFileSync(resolve(directory, 'assets', worker))),
  }
}

function loadRows() {
  const manifest = JSON.parse(readFileSync(resolve(fixtureRoot, 'manifest.json'), 'utf8'))
  verifyPayload(verifyReference(), manifest.reference)
  for (const patch of manifest.patch) {
    if (sha(readFileSync(resolve('tests/migration', patch.file))) !== patch.sha256)
      throw new Error(`Changed reference patch ${patch.file}`)
  }
  for (const fixture of manifest.fixtures) {
    const stored = readFileSync(resolve(fixtureRoot, fixture.file))
    if (sha(fixture.file.endsWith('.gz') ? gunzipSync(stored) : stored) !== fixture.sha256)
      throw new Error(`Changed fixture ${fixture.file}`)
  }
  const all = manifest.fixtures
    .filter((file) => /^generation-v11-.*\.jsonl\.gz$/.test(file.file))
    .flatMap((file) =>
      gunzipSync(readFileSync(resolve(fixtureRoot, file.file)))
        .toString()
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line)),
    )
  if (all.length !== 2241) throw new Error('Complete generation corpus must contain 2241 cases')
  const kernels = JSON.parse(
    readFileSync(resolve(fixtureRoot, 'benchmark-inputs.json'), 'utf8'),
  ).slice(0, 171)
  const boundaries = JSON.parse(
    readFileSync(resolve(fixtureRoot, 'generation-boundaries.json'), 'utf8'),
  )
  const constraints = JSON.parse(readFileSync(resolve(fixtureRoot, 'constraints.json'), 'utf8'))
  constraints.push({
    id: 'interactive:wide-killer-cages',
    input: {
      board: Array(81).fill(0),
      rules: {
        kind: 'killer',
        cages: Array.from({ length: 9 }, (_, row) => ({
          cells: Array.from({ length: 9 }, (_, column) => row * 9 + column),
          sum: 45,
        })),
      },
      limit: 999999,
    },
  })
  const solved = [
    5, 3, 4, 6, 7, 8, 9, 1, 2, 6, 7, 2, 1, 9, 5, 3, 4, 8, 1, 9, 8, 3, 4, 2, 5, 6, 7, 8, 5, 9, 7, 6,
    1, 4, 2, 3, 4, 2, 6, 8, 5, 3, 7, 9, 1, 7, 1, 3, 9, 2, 4, 8, 5, 6, 9, 6, 1, 5, 3, 7, 2, 8, 4, 2,
    8, 7, 4, 1, 9, 6, 3, 5, 3, 4, 5, 2, 8, 6, 1, 7, 9,
  ]
  solved[0] = 0
  constraints.push({
    id: 'interactive:wide-killer-cages-one-blank',
    input: { ...constraints.at(-1).input, board: solved },
  })
  const chains = JSON.parse(readFileSync(resolve(fixtureRoot, 'hint-chains.json'), 'utf8'))
  const hints = [
    chains.find((row) => row.id === 'classic-expert:24:4000000:500'),
    chains.find((row) => row.input.rules.kind === 'killer' && row.expected.kind === 'deduction'),
  ]
  if (hints.some((row) => !row)) throw new Error('Missing representative sealed hint chains')
  const first = new Map()
  for (const row of all)
    if (!first.has(`${row.input.variant}:${row.input.difficulty}`))
      first.set(`${row.input.variant}:${row.input.difficulty}`, row)
  if (first.size !== 19)
    throw new Error('Generation corpus must cover all 19 supported combinations')
  return {
    constraints,
    hints,
    kernels: smoke
      ? kernels.filter(
          (row, index) =>
            kernels.slice(0, index).filter((prior) => prior.rules.kind === row.rules.kind).length <
            2,
        )
      : kernels,
    generation: smoke ? [...first.values()] : all,
    boundaries: smoke ? boundaries.slice(0, 3) : boundaries,
    first: [...first.values()],
    manifestSha256: sha(readFileSync(resolve(fixtureRoot, 'manifest.json'))),
  }
}

function nodeKernels(engine, rows) {
  let preparationMs = 0
  const prepared = rows.map((row) => {
    const started = performance.now()
    const result = engine.prepareRuleComputation(row.rules, engine.createWorkBudget(4000000))
    if (result.status !== 'ready') throw new Error('Incomplete reference preparation')
    const validator = engine.prepareExactValidator(result.computation)
    preparationMs += performance.now() - started
    for (const probe of row.probes) {
      const budget = engine.createWorkBudget(probe.workLimit)
      budget.used = probe.initialWork
      verifyPayload(validator.count(row.board, budget, probe.nodeLimit), probe.expected)
    }
    return { ...row, validator }
  })
  const groups = []
  for (const variant of ['classic', 'diagonal', 'jigsaw', 'killer', 'thermo', 'arrow']) {
    const group = prepared.filter((row) => row.rules.kind === variant)
    const run = () => {
      for (const row of group) {
        const probe = row.probes[0]
        const budget = engine.createWorkBudget(probe.workLimit)
        budget.used = probe.initialWork
        row.validator.count(row.board, budget, probe.nodeLimit)
      }
    }
    const started = performance.now()
    run()
    const repetitions = Math.max(
      1,
      Math.min(10000, Math.ceil(150 / Math.max(0.01, performance.now() - started))),
    )
    const sweepMs = []
    for (let sample = 0; sample < 5; sample++) {
      const started = performance.now()
      for (let repeat = 0; repeat < repetitions; repeat++) run()
      sweepMs.push((performance.now() - started) / repetitions)
    }
    groups.push({ variant, boards: group.length, repetitions, sweepMs })
  }
  return { preparationMs, kernels: groups }
}

function byCombination(rows, key) {
  return Object.fromEntries(
    [...new Set(rows.map((row) => `${row.variant}:${row.difficulty}`))].map((combination) => [
      combination,
      statistics(
        rows
          .filter((row) => `${row.variant}:${row.difficulty}` === combination)
          .map((row) => row[key]),
      ),
    ]),
  )
}

const launched = []
let server
try {
  await build('cargo', [
    'build',
    '--release',
    '--locked',
    '-p',
    'sudoku-core',
    '--example',
    'release_benchmark',
  ])
  await build('pnpm', ['build'])
  await build('pnpm', ['build:subpath'])
  const data = loadRows()
  const deployments = [assets('dist', '/'), assets('dist-subpath', '/sudoku/')]
  if (deployments[0].wasmSha256 !== deployments[1].wasmSha256)
    throw new Error('Deployment binaries differ')
  report.artifacts = {
    deployments,
    nativeSha256: sha(readFileSync(nativePath)),
    factorySha256: sha(readFileSync('packages/sudoku-wasm/pkg/factory.js')),
  }
  report.corpus = {
    kernels: data.kernels.length,
    generation: data.generation.length,
    boundaries: data.boundaries.length,
    manifestSha256: data.manifestSha256,
    interactiveInputsSha256: sha(
      JSON.stringify({ constraints: data.constraints, hints: data.hints }),
    ),
    kernelSha256: sha(JSON.stringify(data.kernels)),
    generationInputSha256: sha(JSON.stringify(data.generation.map((row) => row.input))),
  }
  report.rust = command('rustc', ['--version']).stdout.trim()
  report.commit = command('git', ['rev-parse', 'HEAD']).stdout.trim()
  report.workingTreeStatus = command('git', ['status', '--short']).stdout.trim()
  const engine = await loadEngine({ v11: true })
  server = await createServer({
    configFile: false,
    root: process.cwd(),
    logLevel: 'error',
    resolve: {
      alias: {
        '@reference': resolve(referenceRoot, 'src'),
        '@/core/sudoku': resolve(referenceRoot, 'src/core/sudoku'),
        '@': resolve('src'),
      },
    },
    server: { host: '127.0.0.1', port: 0, hmr: false },
    plugins: [
      {
        name: 'release-audit-only',
        enforce: 'pre',
        transform(source, id) {
          if (!id.includes('/tests/reference/typescript-engine/')) return null
          if (id.endsWith('/generation/types.ts'))
            return source
              .replaceAll('sudoku-v10', 'sudoku-v11')
              .replaceAll('sudoku-variants-v10', 'sudoku-variants-v11')
          if (id.endsWith('/generation/random.ts'))
            return `import { phaseRandom } from '/tests/migration/v11-random.ts'; export function createGenerationRandom(input, phase, layout, proposal = 0) { const seed = Uint8Array.from(input.seed.match(/../g).map(byte => Number.parseInt(byte, 16))); return phaseRandom({...input, seed}, phase, layout, proposal) }`
          return null
        },
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            const path = decodeURIComponent((request.url ?? '').split('?')[0])
            const deployment = deployments.find(
              (item) => path === item.base || path.startsWith(`${item.base}assets/`),
            )
            if (!deployment) return next()
            const relative =
              path === deployment.base ? 'index.html' : path.slice(deployment.base.length)
            const file = resolve(deployment.directory, relative)
            if (!file.startsWith(resolve(deployment.directory) + sep) || !existsSync(file)) {
              response.statusCode = 404
              response.end()
              return
            }
            response.setHeader(
              'Content-Type',
              {
                '.js': 'text/javascript',
                '.css': 'text/css',
                '.wasm': 'application/wasm',
                '.html': 'text/html',
                '.woff2': 'font/woff2',
              }[extname(file)] ?? 'application/octet-stream',
            )
            response.setHeader('Cache-Control', 'no-store')
            response.end(readFileSync(file))
          })
        },
      },
    ],
  })
  await server.listen()
  const address = server.httpServer.address()
  const origin = `http://127.0.0.1:${address.port}`
  for (const name of browserNames) {
    if (!{ chromium, firefox, webkit }[name]) throw new Error(`Unsupported browser ${name}`)
    let browser
    let browserServer
    try {
      browserServer = await { chromium, firefox, webkit }[name].launchServer({ timeout: 20000 })
      browser = await { chromium, firefox, webkit }[name].connect(browserServer.wsEndpoint())
    } catch (error) {
      report.browsers[name] = { status: 'unavailable', error: error.message }
      continue
    }
    const page = await browser.newPage()
    launched.push({ name, browser, browserServer, page })
    await page.goto(`${origin}/benchmarks/sudoku-core/page.html`)
    await page.waitForFunction(() => !!globalThis.sudokuReleaseAudit)
    const startup = []
    for (const deployment of deployments) {
      const target = deployment.base === '/' ? page : await browser.newPage()
      if (target !== page) {
        await target.goto(`${origin}/benchmarks/sudoku-core/page.html`)
        await target.waitForFunction(() => !!globalThis.sudokuReleaseAudit)
      }
      startup.push({
        base: deployment.base,
        condition:
          deployment.base === '/'
            ? 'fresh-browser-first-module'
            : 'same-browser-compiled-code-cache',
        ...(await target.evaluate(
          ({ asset, base, kernels }) =>
            globalThis.sudokuReleaseAudit.initialize(asset, base, kernels),
          {
            asset: `${origin}${deployment.wasm}`,
            base: deployment.base,
            kernels: target === page ? data.kernels : [],
          },
        )),
      })
      if (target !== page) await target.close()
    }
    report.browsers[name] = { status: 'ready', version: browser.version(), startup }
  }
  report.source = fingerprints()
  phases.ready()
  await phases.measure(async () => {
    console.log('Native release audit')
    const nativeInput = JSON.stringify({
      kernels: data.kernels,
      generation: [...data.generation, ...data.boundaries].map((row) => ({
        ...row,
        expected: row.expected.result,
      })),
    })
    const timed =
      process.platform === 'darwin'
        ? ['/usr/bin/time', ['-l', nativePath]]
        : process.platform === 'linux'
          ? ['/usr/bin/time', ['-v', nativePath]]
          : [nativePath, []]
    const native = command(timed[0], timed[1], { input: nativeInput })
    report.native = JSON.parse(native.stdout)
    const rss = native.stderr.match(
      /(\d+)\s+maximum resident set size|Maximum resident set size \(kbytes\):\s*(\d+)/,
    )
    report.native.peakProcessRssBytes = rss ? Number(rss[1] ?? rss[2]) * (rss[1] ? 1 : 1024) : null
    report.typescriptNode = nodeKernels(engine, data.kernels)
    report.typescriptNode.generation = []
    for (const [index, row] of [...data.generation, ...data.boundaries].entries()) {
      const request = engine.createGenerationInput(
        row.input.variant,
        row.input.difficulty,
        Buffer.from(row.input.seed).toString('hex'),
      )
      const measured = verifyThenMeasure(
        () => engine.generatePuzzle(request, row.input.limits),
        row.expected.result,
      )
      report.typescriptNode.generation.push({
        id: row.id,
        variant: row.input.variant,
        difficulty: row.input.difficulty,
        durationMs: measured.durationMs,
        status: measured.result.status,
      })
      if ((index + 1) % 128 === 0) console.log(`Node reference generation ${index + 1}`)
    }
    for (const { name, browserServer, page } of launched) {
      console.log(`${name} prepared kernels`)
      const result = report.browsers[name]
      result.kernels = await page.evaluate(() => globalThis.sudokuReleaseAudit.kernels())
      result.generation = []
      const rows = [...data.generation, ...data.boundaries]
      for (let index = 0; index < rows.length; index += 64) {
        result.generation.push(
          ...(await page.evaluate(
            (rows) => globalThis.sudokuReleaseAudit.generation(rows),
            rows.slice(index, index + 64),
          )),
        )
        console.log(`${name} generation ${Math.min(index + 64, rows.length)}/${rows.length}`)
      }
      const slowest = new Map()
      for (const row of result.generation.slice(0, data.generation.length)) {
        const key = `${row.variant}:${row.difficulty}`
        if (!slowest.has(key) || row.wasm > slowest.get(key).wasm) slowest.set(key, row)
      }
      const ids = new Set([
        ...data.first.map((row) => row.id),
        ...[...slowest.values()].map((row) => row.id),
      ])
      const workerRows = data.generation.filter((row) => ids.has(row.id))
      result.workers = []
      for (const deployment of deployments)
        result.workers.push({
          base: deployment.base,
          ...(await page.evaluate(
            ({ rows, asset, base }) => globalThis.sudokuReleaseAudit.workers(rows, asset, base),
            { rows: workerRows, asset: `${origin}${deployment.worker}`, base: deployment.base },
          )),
        })
      result.interactive = await page.evaluate(() => globalThis.sudokuReleaseAudit.interactive())
      result.interactiveBudgetCases = await page.evaluate(
        ({ rows, asset }) => globalThis.sudokuReleaseAudit.interactiveBudgetCases(rows, asset),
        { rows: data.constraints, asset: deployments[0].worker },
      )
      result.resources = await page.evaluate(() => globalThis.sudokuReleaseAudit.resources())
      result.resources.instanceLifecycles = await observeResources({
        name,
        browserServer,
        page,
        asset: deployments[0].worker,
      })
      if (result.resources.instanceLifecycles.observation.available)
        requireLifecycleEvidence(result.resources.instanceLifecycles)
      result.hintReception = await page.evaluate(
        (rows) => globalThis.sudokuReleaseAudit.hintReception(rows),
        data.hints,
      )
      result.seedCosts = await page.evaluate(() => globalThis.sudokuReleaseAudit.seedCosts())
      verifyPayload(result.seedCosts.typescript.checksum, report.native.seedCosts.checksum)
      verifyPayload(
        result.seedCosts.typescriptPhaseAnd256Words.checksum,
        report.native.seedCosts.phaseAnd256Words.checksum,
      )
      const full = result.generation.slice(0, data.generation.length)
      result.byCombination = {
        typescript: byCombination(full, 'typescript'),
        wasm: byCombination(full, 'wasm'),
      }
      result.aggregateGenerationSpeedup =
        statistics(full.map((row) => row.typescript)).totalMs /
        statistics(full.map((row) => row.wasm)).totalMs
      result.aggregatePreparedExactSpeedup =
        result.kernels.reduce((sum, row) => sum + statistics(row.sweepMs.typescript).meanMs, 0) /
        result.kernels.reduce((sum, row) => sum + statistics(row.sweepMs.wasm).meanMs, 0)
      result.regressions = Object.entries(result.byCombination.wasm)
        .filter(
          ([key, wasm]) =>
            wasm.p95Ms > result.byCombination.typescript[key].p95Ms * 1.1 &&
            wasm.p95Ms - result.byCombination.typescript[key].p95Ms > 1,
        )
        .map(([key, value]) => ({
          combination: key,
          wasm: value.p95Ms,
          typescript: result.byCombination.typescript[key].p95Ms,
        }))
      requireInteractiveCoverage([
        ...result.interactive,
        ...result.hintReception,
        ...result.interactiveBudgetCases.profiles,
      ])
      result.gates = {
        preparedExact: result.aggregatePreparedExactSpeedup >= 2,
        aggregateGeneration: result.aggregateGenerationSpeedup >= 1,
        p95Generation: result.regressions.length === 0,
        workerDeadline: result.workers.every((worker) => worker.statistics.maxMs < 3000),
        interactive: [
          ...result.interactive,
          ...result.interactiveBudgetCases.profiles,
          ...result.hintReception,
        ].every((row) => row.p95Ms < 16.67 && row.maxMs < 50),
        allocator: result.resources.stableAllocatorAfterWarmup,
        instanceObservation: result.resources.instanceLifecycles.observation.available,
      }
      result.status = 'measured'
      await page.evaluate(() => globalThis.sudokuReleaseAudit.dispose())
    }
  })
  if (fingerprints().sha256 !== report.source.sha256)
    throw new Error('Source changed during measurement')
  report.native.aggregatePreparedExactSpeedup =
    report.typescriptNode.kernels.reduce((sum, row) => sum + statistics(row.sweepMs).meanMs, 0) /
    report.native.kernels.reduce((sum, row) => sum + statistics(row.sweepMs).meanMs, 0)
  report.native.aggregateGenerationSpeedup =
    statistics(
      report.typescriptNode.generation
        .slice(0, data.generation.length)
        .map((row) => row.durationMs),
    ).totalMs /
    statistics(
      report.native.generation.slice(0, data.generation.length).map((row) => row.durationMs),
    ).totalMs
  report.gates = {
    nativePreparedExact: report.native.aggregatePreparedExactSpeedup >= 2,
    nativeGeneration: report.native.aggregateGenerationSpeedup >= 1,
    completeCorpus: !smoke && data.kernels.length === 171 && data.generation.length === 2241,
    supportedBrowserCoverage: ['chromium', 'firefox', 'webkit'].every(
      (name) => report.browsers[name]?.status === 'measured',
    ),
    availableBrowserPerformance:
      launched.length > 0 &&
      launched.every(({ name }) => Object.values(report.browsers[name].gates).every(Boolean)),
  }
  report.releaseReady = Object.values(report.gates).every(Boolean)
  report.completedAt = new Date().toISOString()
  mkdirSync(resolve(output, '..'), { recursive: true })
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
  console.log(`Audit saved: ${output}; releaseReady=${report.releaseReady}`)
  if (!smoke && !report.releaseReady) process.exitCode = 2
} finally {
  for (const { browser, browserServer } of launched) {
    await browser.close()
    await browserServer.close()
  }
  await server?.close()
}
