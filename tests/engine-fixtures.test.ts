// @vitest-environment node
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { expect, it } from 'vitest'
import manifest from './fixtures/engine-contracts/manifest.json'

const fixtureDirectory = 'tests/fixtures/engine-contracts'

it('accounts for every retained independent engine fixture', () => {
  const files = readdirSync(fixtureDirectory).filter((file) => file !== 'manifest.json')

  expect(files.sort()).toEqual(manifest.fixtures.map((fixture) => fixture.file).sort())
})

it.each(manifest.fixtures)('preserves sealed bytes and case counts for $file', (fixture) => {
  const bytes = readFileSync(`${fixtureDirectory}/${fixture.file}`)

  expect(bytes.length).toBe(fixture.bytes)
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(fixture.sha256)
  if (typeof fixture.cases === 'number') {
    expect(JSON.parse(bytes.toString('utf8'))).toHaveLength(fixture.cases)
  }
})
