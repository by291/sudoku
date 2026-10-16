import assert from 'node:assert/strict'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import os from 'node:os'
import { build, preview } from 'vite'

const directory = import.meta.dirname
const root = resolve(directory, '../..')
const output = resolve(root, '.superpowers/rust-core-benchmark')
const corpusPath = resolve(output, 'corpus.json')
const publicDirectory = resolve(output, 'browser-public')
const wasmDirectory = resolve(publicDirectory, 'wasm')
const targetDirectory = resolve(output, 'target')
const bindgen = process.env.WASM_BINDGEN ?? resolve(output, 'wasm-tools/bin/wasm-bindgen')
const configFile = resolve(directory, 'browser.config.mjs')
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(root, '.superpowers/playwright-browsers')
const { chromium, firefox, webkit } = await import('@playwright/test')

function command(executable, args) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
  })
  assert.equal(result.status, 0, result.error?.message ?? result.stderr + result.stdout)
  return result.stdout.trim()
}

assert.equal(
  command(bindgen, ['--version']),
  'wasm-bindgen 0.2.129',
  'Use the pinned wasm-bindgen CLI',
)
if (!existsSync(corpusPath)) {
  command(process.execPath, [resolve(directory, 'run.mjs'), 'prepare'])
}
command('cargo', [
  'build',
  '--manifest-path',
  resolve(directory, 'Cargo.toml'),
  '--lib',
  '--target',
  'wasm32-unknown-unknown',
  '--release',
  '--offline',
  '--locked',
  '--target-dir',
  targetDirectory,
])
mkdirSync(wasmDirectory, { recursive: true })
command(bindgen, [
  resolve(targetDirectory, 'wasm32-unknown-unknown/release/sudoku_core_benchmark.wasm'),
  '--target',
  'web',
  '--out-dir',
  wasmDirectory,
])
copyFileSync(corpusPath, resolve(publicDirectory, 'corpus.json'))
await build({ configFile })

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const sourceDirectory = resolve(root, 'src/core/sudoku')
const sources = readdirSync(sourceDirectory, { recursive: true })
  .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
  .sort()
  .map((file) => ({ file, sha256: sha256(readFileSync(resolve(sourceDirectory, file))) }))
const benchmarkSources = readdirSync(directory, { recursive: true })
  .filter((file) => /\.(mjs|rs|html)$/.test(file) || ['Cargo.toml', 'Cargo.lock'].includes(file))
  .sort()
  .map((file) => ({ file, sha256: sha256(readFileSync(resolve(directory, file))) }))
const wasmBytes = readFileSync(resolve(wasmDirectory, 'sudoku_core_benchmark_bg.wasm'))
const report = {
  createdAt: new Date().toISOString(),
  host: {
    cpu: os.cpus()[0].model,
    architecture: os.arch(),
    platform: os.platform(),
    release: os.release(),
  },
  rust: command('rustc', ['--version']),
  wasmBindgen: command(bindgen, ['--version']),
  commit: command('git', ['rev-parse', 'HEAD']),
  sourceFingerprint: sha256(JSON.stringify(sources)),
  sources,
  benchmarkSourceFingerprint: sha256(JSON.stringify(benchmarkSources)),
  benchmarkSources,
  corpusSha256: sha256(readFileSync(corpusPath)),
  wasm: { bytes: wasmBytes.length, sha256: sha256(wasmBytes) },
  browsers: [],
}
const groups = ['candidates', 'classic', 'diagonal', 'jigsaw', 'killer', 'thermo', 'arrow']
const server = await preview({
  configFile,
  preview: { host: '127.0.0.1', port: 4181, strictPort: true },
})
try {
  for (const [name, browserType] of Object.entries({ chromium, webkit, firefox })) {
    let browser
    try {
      browser = await browserType.launch({ headless: true })
    } catch (error) {
      report.browsers.push({ name, status: 'unavailable', error: String(error) })
      process.stdout.write(`${name}: browser launch unavailable\n`)
      continue
    }

    const result = { name, version: browser.version(), status: 'passed', rows: [] }
    try {
      for (const group of groups) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
        const errors = []
        page.on('pageerror', (error) => errors.push(String(error)))
        try {
          await page.goto('http://127.0.0.1:4181/browser.html')
          await page.waitForFunction(() => typeof globalThis.runBenchmark === 'function')
          const row = await page.evaluate((group) => globalThis.runBenchmark(group), group)
          assert.deepEqual(errors, [], `${name} page errors`)
          result.rows.push(row)
          const time = row.timings
          process.stdout.write(
            `${name}/${group}: JS ${time.typescript.toFixed(2)} us, WASM batch ${time.wasmBatch.toFixed(2)} us (${(time.typescript / time.wasmBatch).toFixed(2)}x), boundary ${time.wasmBoundary.toFixed(2)} us (${(time.typescript / time.wasmBoundary).toFixed(2)}x)\n`,
          )
        } finally {
          await page.close()
        }
      }
      report.browsers.push(result)
    } finally {
      await browser.close()
    }
  }
} finally {
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  )
}
assert(
  report.browsers.some((browser) => browser.status === 'passed'),
  'No browser could execute the benchmark',
)
writeFileSync(resolve(output, 'wasm-results.json'), JSON.stringify(report, null, 2) + '\n')
