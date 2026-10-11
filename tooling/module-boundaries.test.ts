// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(path) : /\.(ts|vue)$/.test(path) ? [path] : []
  })
}

it('keeps core imports independent from interface and infrastructure', () => {
  const files = sourceFiles('src').filter((file) => /[\\/]core[\\/]/.test(file))
  const forbidden =
    /(?:from\s+|import\s*\()['"](?:vue|pinia|idb|[^'"\n]*(?:features|infrastructure|app)\/)/
  for (const file of files) expect(readFileSync(file, 'utf8'), file).not.toMatch(forbidden)
})
