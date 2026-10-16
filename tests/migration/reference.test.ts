// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

function withDirectory(operation: (directory: string) => void) {
  const directory = mkdtempSync(join(tmpdir(), 'sudoku-reference-'))

  try {
    operation(directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function run(script: string, args: string[]) {
  return spawnSync(process.execPath, [resolve('tests/migration', script), ...args], {
    encoding: 'utf8',
  })
}

describe('migration reference integrity', () => {
  it('rejects a changed reference source', () => {
    withDirectory((directory) => {
      const original = 'export const value = 1\n'
      writeFileSync(join(directory, 'source.ts'), 'export const value = 2\n')
      writeFileSync(
        join(directory, 'manifest.json'),
        JSON.stringify({
          sources: [
            { file: 'source.ts', sha256: createHash('sha256').update(original).digest('hex') },
          ],
        }),
      )

      const result = run('freeze-reference.mjs', ['--verify', directory])

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('Changed reference source')
    })
  })

  it('rejects a corrupted expected result', () => {
    withDirectory((directory) => {
      const expected = join(directory, 'expected.json')
      const actual = join(directory, 'actual.json')
      writeFileSync(expected, JSON.stringify({ count: 1, solution: [1, 2, 3] }))
      writeFileSync(actual, JSON.stringify({ count: 1, solution: [2, 1, 3] }))

      const result = run('run.mjs', ['--compare', expected, actual])

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('Migration result mismatch')
    })
  })

  it('resolves frozen imports without the production engine', () => {
    withDirectory((directory) => {
      mkdirSync(join(directory, 'src/core/sudoku'), { recursive: true })
      writeFileSync(join(directory, 'src/core/sudoku/value.ts'), 'export const value = 42\n')
      writeFileSync(
        join(directory, 'src/core/sudoku/probe.ts'),
        "import { value } from '@/core/sudoku/value'\nexport default value\n",
      )

      const result = run('reference-loader.mjs', ['--probe', directory, 'src/core/sudoku/probe.ts'])

      expect(result.status).toBe(0)
      expect(result.stdout.trim()).toBe('42')
    })
  })
})
