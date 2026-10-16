import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

it('production_graph_contains_no_typescript_solver', () => {
  const violations: string[] = []
  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(path)
      } else if (/\.(ts|vue)$/.test(path) && !path.endsWith('.test.ts')) {
        const source = readFileSync(path, 'utf8')
        if (
          /from\s+['"][^'"]*(?:@reference|core\/sudoku|tests\/reference)|import\s*\([^)]*(?:@reference|core\/sudoku|tests\/reference)/.test(
            source,
          )
        ) {
          violations.push(path)
        }
      }
    }
  }
  visit('src')

  expect(violations).toEqual([])
  expect(existsSync('src/core/sudoku')).toBe(false)
})
