import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

const MAX_FIXTURE_OUTPUT_BYTES = 256 * 1024 * 1024

export function nativeResults(suite, rows) {
  assert.ok(
    ['rules', 'constraints', 'support', 'exact', 'exact-prepared', 'editing'].includes(suite),
    'This native suite is not implemented yet',
  )
  const requests = rows.map((row) => JSON.stringify({ suite, input: row.input })).join('\n') + '\n'
  const result = spawnSync(
    'cargo',
    ['run', '--quiet', '--release', '-p', 'sudoku-core', '--example', 'fixture_runner'],
    {
      input: requests,
      encoding: 'utf8',
      maxBuffer: MAX_FIXTURE_OUTPUT_BYTES,
    },
  )
  assert.equal(result.status, 0, result.error?.message ?? result.stderr)
  const values = result.stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  assert.equal(values.length, rows.length, 'Native fixture response count mismatch')
  return values
}
