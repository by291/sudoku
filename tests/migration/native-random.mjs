import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const vectors = JSON.parse(
  readFileSync(new URL('../fixtures/engine-contracts/random.json', import.meta.url), 'utf8'),
).filter((row) => row.kind === 'raw')
const run = (requests) =>
  spawnSync('cargo', ['run', '--quiet', '-p', 'sudoku-core', '--example', 'fixture_runner'], {
    input: requests.map((input) => JSON.stringify({ suite: 'random', input })).join('\n') + '\n',
    encoding: 'utf8',
  })
const result = run(vectors.map((vector) => ({ seed: vector.seed, count: vector.words.length })))
assert.equal(result.status, 0, result.stderr)
assert.deepStrictEqual(
  result.stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line)),
  vectors.map((vector) => vector.words),
)
for (const request of [
  { seed: [0], count: 1 },
  { seed: Array(32).fill(0), count: 10001 },
]) {
  const invalid = run([request])
  assert.notEqual(invalid.status, 0)
  assert.equal(invalid.stdout, '')
}
console.log('Native JSONL adapter: 240 independent words and invalid-input contracts PASS')
