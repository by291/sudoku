import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

export function compareResults(expected, actual) {
  assert.deepStrictEqual(actual, expected, 'Migration result mismatch')
}

if (process.argv[2] === '--compare') {
  compareResults(...process.argv.slice(3, 5).map((file) => JSON.parse(readFileSync(file, 'utf8'))))
} else {
  const { runMigration } = await import('./suites.mjs')
  await runMigration(process.argv.slice(2).filter((value) => value !== '--'))
}
