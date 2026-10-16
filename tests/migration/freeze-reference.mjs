import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const BASELINE_COMMIT = '7c95fb7832e614d4ee8d5089f69bac71d4886c36'
export const referenceRoot = fileURLToPath(
  new URL('../reference/typescript-engine/', import.meta.url),
)
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

export function verifyReference(directory = referenceRoot) {
  const manifest = JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8'))
  for (const source of manifest.sources) {
    assert.equal(
      sha256(readFileSync(resolve(directory, source.file))),
      source.sha256,
      `Changed reference source: ${source.file}`,
    )
  }
  return manifest
}

export function freezeReference() {
  const core = execFileSync(
    'git',
    ['ls-tree', '-r', '--name-only', BASELINE_COMMIT, 'src/core/sudoku'],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
  assert.equal(core.length, 58)
  const extra = [
    'src/worker/hintEvidence.ts',
    'src/features/game/model/session.ts',
    'tests/fixtures/rating.ts',
    'tests/fixtures/sudoku.ts',
    'tests/fixtures/variants.ts',
    'tests/fixtures/classicPuzzles.ts',
    'tests/support/referenceVariants.ts',
  ]
  const sources = [...core, ...extra].sort().map((file) => {
    const bytes = execFileSync('git', ['show', `${BASELINE_COMMIT}:${file}`])
    const target = resolve(referenceRoot, file)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, bytes)
    return { file, sha256: sha256(bytes) }
  })
  writeFileSync(
    resolve(referenceRoot, 'manifest.json'),
    JSON.stringify(
      {
        commit: BASELINE_COMMIT,
        coreSourceCount: 58,
        sources,
      },
      null,
      2,
    ) + '\n',
  )
  return verifyReference()
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--verify') {
    verifyReference(process.argv[3])
  } else {
    const manifest = freezeReference()
    console.log(`Frozen ${manifest.sources.length} sources at ${manifest.commit}`)
  }
}
