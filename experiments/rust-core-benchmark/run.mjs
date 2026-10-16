import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import os from 'node:os'
import { root } from './engine.mjs'
import { createCorpus } from './corpus.mjs'

const directory = import.meta.dirname
const output = resolve(root, '.superpowers/rust-core-benchmark')
mkdirSync(output, { recursive: true })
const corpusPath = resolve(output, 'corpus.json')
const environment = {
  ...process.env,
  CARGO_TARGET_DIR: resolve(output, 'target'),
  SUDOKU_BENCH_CORPUS: corpusPath,
}

function command(executable, args) {
  const result = spawnSync(executable, args, {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  assert.equal(result.status, 0, result.error?.message ?? result.stderr + result.stdout)
  return result.stdout.trim()
}

const mode = process.argv[2] ?? 'run'
assert(['prepare', 'run', 'measure'].includes(mode))
if (mode !== 'measure') {
  const cases = await createCorpus()
  writeFileSync(corpusPath, JSON.stringify(cases))
  process.stdout.write(
    `Corpus: ${cases.length} boards, ${cases.reduce((n, c) => n + c.probes.length, 0)} budget probes\n`,
  )
}
if (mode === 'prepare') {
  process.stdout.write(`Saved ${corpusPath}\n`)
  process.exit(0)
}

const cargoArgs = ['--manifest-path', resolve(directory, 'Cargo.toml'), '--offline', '--locked']
process.stdout.write(command('cargo', ['test', ...cargoArgs, '--release']) + '\n')
command('cargo', ['build', ...cargoArgs, '--release'])
const binary = resolve(output, 'target/release/sudoku-core-benchmark')
const cases = JSON.parse(readFileSync(corpusPath, 'utf8'))
const groups = ['candidates', 'classic', 'diagonal', 'jigsaw', 'killer', 'thermo', 'arrow']
const rows = []
for (const group of groups) {
  const samples = { typescript: [], rust: [] }
  const checksums = { typescript: [], rust: [] }
  const measure = (language, loops) =>
    JSON.parse(
      language === 'typescript'
        ? command(process.execPath, [
            resolve(directory, 'worker.mjs'),
            corpusPath,
            group,
            String(loops),
          ])
        : command(binary, [corpusPath, group, String(loops)]),
    )
  // Use identical batch counts. Calibrate on V8, then warm each fresh process before timing.
  const pilot = measure('typescript', 1)
  const iterations = Math.max(1, Math.ceil(180 / pilot.elapsedMs))
  for (let round = 0; round < 7; round++) {
    const order = round % 2 === 0 ? ['typescript', 'rust'] : ['rust', 'typescript']
    for (const language of order) {
      const result = measure(language, iterations)
      samples[language].push(result.elapsedMs)
      checksums[language].push(result.checksum)
    }
    assert.equal(checksums.typescript[round], checksums.rust[round], `${group} timed checksum`)
  }
  const count = cases.filter(
    (entry) => entry.benchmark && (group === 'candidates' || entry.variant === group),
  ).length
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
  const typescriptUs = (median(samples.typescript) * 1000) / iterations / count
  const rustUs = (median(samples.rust) * 1000) / iterations / count
  rows.push({
    group,
    count,
    iterations,
    samples,
    checksums,
    typescriptUs,
    rustUs,
    speedup: typescriptUs / rustUs,
  })
  process.stdout.write(
    `${group}: TypeScript ${typescriptUs.toFixed(2)} us, Rust ${rustUs.toFixed(2)} us, ${(typescriptUs / rustUs).toFixed(2)}x\n`,
  )
}

const sha256 = (text) => createHash('sha256').update(text).digest('hex')
const sourceDirectory = resolve(root, 'src/core/sudoku')
const sources = readdirSync(sourceDirectory, { recursive: true })
  .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
  .sort()
  .map((file) => ({ file, sha256: sha256(readFileSync(resolve(sourceDirectory, file))) }))
const benchmarkSources = readdirSync(directory, { recursive: true })
  .filter((file) => /\.(mjs|rs)$/.test(file) || ['Cargo.toml', 'Cargo.lock'].includes(file))
  .sort()
  .map((file) => ({ file, sha256: sha256(readFileSync(resolve(directory, file))) }))
const report = {
  createdAt: new Date().toISOString(),
  host: {
    cpu: os.cpus()[0].model,
    platform: os.platform(),
    release: os.release(),
    architecture: os.arch(),
  },
  node: process.version,
  rust: command('rustc', ['--version']),
  commit: command('git', ['rev-parse', 'HEAD']),
  sourceFingerprint: sha256(JSON.stringify(sources)),
  sources,
  benchmarkSourceFingerprint: sha256(JSON.stringify(benchmarkSources)),
  benchmarkSources,
  corpusSha256: sha256(readFileSync(corpusPath)),
  boards: cases.length,
  probes: cases.reduce((n, entry) => n + entry.probes.length, 0),
  rows,
}
writeFileSync(resolve(output, 'results.json'), JSON.stringify(report, null, 2) + '\n')
