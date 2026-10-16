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

it('does_not_redirect_imports_owned_by_other_projects_or_test_harnesses', () => {
  withDirectory((directory) => {
    const frozen = join(directory, 'frozen')
    const production = join(directory, 'production')
    mkdirSync(join(frozen, 'src/core/sudoku'), { recursive: true })
    mkdirSync(join(production, 'src/core/sudoku'), { recursive: true })
    writeFileSync(join(frozen, 'src/core/sudoku/value.ts'), 'export const value = 42\n')
    writeFileSync(join(production, 'src/core/sudoku/value.ts'), 'export const value = 99\n')
    writeFileSync(
      join(frozen, 'probe.ts'),
      "import { value } from '@/core/sudoku/value'\nexport default value\n",
    )
    writeFileSync(join(production, 'relative.js'), 'export const extra = 1\n')
    writeFileSync(
      join(production, 'probe.ts'),
      "import { value } from '@/core/sudoku/value'\nimport { extra } from './relative'\nexport default value + extra\n",
    )
    const script = `
      import { registerHooks } from 'node:module'
      import { resolve } from 'node:path'
      import { pathToFileURL } from 'node:url'
      import { registerReference } from ${JSON.stringify(new URL('./reference-loader.mjs', import.meta.url).href)}
      registerHooks({ resolve(specifier, context, next) {
        if (specifier.startsWith('@/')) return next(pathToFileURL(resolve(${JSON.stringify(production)}, 'src', specifier.slice(2) + '.ts')).href, context)
        if (specifier === './relative') return next(specifier + '.js', context)
        return next(specifier, context)
      } })
      registerReference({ directory: ${JSON.stringify(frozen)}, verify: false })
      const frozen = await import(pathToFileURL(${JSON.stringify(join(frozen, 'probe.ts'))}).href)
      const production = await import(pathToFileURL(${JSON.stringify(join(production, 'probe.ts'))}).href)
      console.log(frozen.default + ':' + production.default)
    `

    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
      encoding: 'utf8',
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout.trim()).toBe('42:100')
  })
})
