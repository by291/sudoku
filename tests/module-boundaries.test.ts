// @vitest-environment node
import { ESLint } from 'eslint'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const lint = new ESLint()

async function boundaryMessages(filePath: string, target: string, kind: 'static' | 'dynamic') {
  const statement = kind === 'static' ? `import '${target}'` : `void import('${target}')`
  const source = filePath.endsWith('.vue')
    ? `<script setup lang="ts">\n${statement}\n</script>\n<template><div /></template>`
    : statement
  const [result] = await lint.lintText(source, { filePath })

  expect(result.fatalErrorCount).toBe(0)

  return result.messages.filter(
    (message) =>
      message.ruleId === 'no-restricted-imports' || message.ruleId === 'no-restricted-syntax',
  )
}

describe.each(['static', 'dynamic'] as const)('module dependency boundaries (%s)', (kind) => {
  it.each([
    ['src/core/sudoku/types.ts', '@/core/sudoku/logic/solver'],
    ['src/core/sudoku/types.ts', '@/core/sudoku/rating/assessment'],
    ['src/core/sudoku/types.ts', '@/core/sudoku/generation/generate'],
    ['src/core/sudoku/budget.ts', '@/core/sudoku/logic/solver'],
    ['src/core/sudoku/budget.ts', '@/core/sudoku/rating/assessment'],
    ['src/core/sudoku/budget.ts', '@/core/sudoku/generation/generate'],
    ['src/core/sudoku/random.ts', '@/core/sudoku/logic/solver'],
    ['src/core/sudoku/random.ts', '@/core/sudoku/rating/assessment'],
    ['src/core/sudoku/random.ts', '@/core/sudoku/generation/generate'],
    ['src/core/sudoku/rules/fixture.ts', '@/core/sudoku/constraints/support'],
    ['src/core/sudoku/rules/fixture.ts', '@/core/sudoku/search/exact'],
    ['src/core/sudoku/rules/fixture.ts', '@/core/sudoku/logic/solver'],
    ['src/core/sudoku/rules/fixture.ts', '@/core/sudoku/rating/assessment'],
    ['src/core/sudoku/rules/fixture.ts', '@/core/sudoku/generation/generate'],
    ['src/core/sudoku/constraints/fixture.ts', '@/core/sudoku/search/exact'],
    ['src/core/sudoku/constraints/fixture.ts', '@/core/sudoku/logic/solver'],
    ['src/core/sudoku/constraints/fixture.ts', '@/core/sudoku/rating/assessment'],
    ['src/core/sudoku/constraints/fixture.ts', '@/core/sudoku/generation/generate'],
    ['src/core/sudoku/search/fixture.ts', '@/core/sudoku/logic/solver'],
    ['src/core/sudoku/search/fixture.ts', '@/core/sudoku/rating/assessment'],
    ['src/core/sudoku/search/fixture.ts', '@/core/sudoku/generation/generate'],
    ['src/core/sudoku/logic/fixture.ts', '@/core/sudoku/rating/assessment'],
    ['src/core/sudoku/logic/fixture.ts', '@/core/sudoku/generation/generate'],
    ['src/core/sudoku/rating/fixture.ts', '@/core/sudoku/generation/generate'],
    ['src/core/sudoku/rules/definitions/fixture.ts', '@/core/sudoku/rules/registry'],
    ['src/core/sudoku/rules/definitions/fixture.ts', '@/core/sudoku/rules/context'],
    ['src/core/sudoku/fixture.ts', 'vue'],
    ['src/core/sudoku/fixture.ts', 'naive-ui'],
    ['src/core/sudoku/fixture.ts', '@/shared/components/SudokuBoard.vue'],
    ['src/core/sudoku/fixture.ts', '@/runtime'],
    ['src/core/sudoku/fixture.ts', '@/storage/records'],
    ['src/core/sudoku/fixture.ts', '@/worker/protocol'],
    ['src/shared/components/Fixture.vue', '@/features/game/stores/useGameStore'],
    ['src/shared/components/Fixture.vue', '@/router'],
    ['src/features/game/stores/fixture.ts', '@/App.vue'],
    ['src/features/game/stores/fixture.ts', '@/theme/useTheme'],
    ['src/features/game/views/Fixture.vue', '@/storage/repository'],
    ['src/features/game/views/Fixture.vue', '@/storage/database'],
    ['src/shared/components/Fixture.vue', '@/storage/records'],
    ['src/shared/components/Fixture.vue', '@/worker/client'],
    ['src/shared/components/Fixture.vue', '@/runtime'],
    ['src/features/game/model/fixture.ts', 'pinia'],
    ['src/features/learning/model/fixture.ts', '@/features/learning/stores/useLearningStore'],
    ['src/runtime.ts', '@/features/game/stores/useGameStore'],
    ['src/runtime.ts', '@/layouts/AppLayout.vue'],
    ['src/storage/fixture.ts', '@/features/game/stores/useGameStore'],
    ['src/storage/fixture.ts', '@/router'],
    ['src/storage/fixture.ts', '@/runtime'],
    ['src/worker/fixture.ts', '@/features/game/views/GameView.vue'],
    ['src/worker/fixture.ts', '@/theme/useTheme'],
    ['src/worker/fixture.ts', '@/runtime'],
    ['src/features/game/stores/fixture.ts', '../model/session'],
  ])('rejects %s importing %s', async (filePath, target) => {
    expect((await boundaryMessages(filePath, target, kind)).length).toBeGreaterThan(0)
  })

  it.each([
    ['src/core/sudoku/generation/fixture.ts', '@/core/sudoku/rating/assessment'],
    ['src/core/sudoku/generation/fixture.ts', '@/core/sudoku/search/exact'],
    ['src/core/sudoku/rating/fixture.ts', '@/core/sudoku/logic/solver'],
    ['src/core/sudoku/hint.ts', '@/core/sudoku/rating/policies'],
    ['src/core/sudoku/board.ts', '@/core/sudoku/rules/context'],
    ['src/features/learning/model/fixture.ts', '@/features/game/model/techniquePresentation'],
    ['src/core/sudoku/fixture.ts', '@/core/sudoku/types'],
    ['src/shared/components/Fixture.vue', '@/core/sudoku/types'],
    ['src/shared/components/Fixture.vue', 'naive-ui'],
    ['src/features/game/stores/fixture.ts', '@/runtime'],
    ['src/features/game/views/Fixture.vue', '@/shared/components/SudokuBoard.vue'],
    ['src/features/game/model/fixture.ts', '@/core/sudoku/board'],
    ['src/features/records/model/fixture.ts', '@/features/game/model/session'],
    ['src/runtime.ts', '@/features/game/model/session'],
    ['src/runtime.ts', '@/storage/ownership'],
    ['src/runtime.ts', '@/worker/client'],
    ['src/storage/fixture.ts', '@/features/game/model/session'],
    ['src/storage/fixture.ts', '@/storage/ownership'],
    ['src/worker/fixture.ts', '@/core/sudoku/generation/generate'],
    ['src/theme/fixture.ts', '@/features/settings/model/preferences'],
    ['src/features/game/stores/fixture.test.ts', '@/router'],
  ])('allows %s importing %s', async (filePath, target) => {
    expect(await boundaryMessages(filePath, target, kind)).toEqual([])
  })
})

it('keeps browser globals out of the Sudoku engine', async () => {
  const [result] = await lint.lintText('window.setTimeout(() => {}, 100)', {
    filePath: 'src/core/sudoku/fixture.ts',
  })

  expect(result.messages.some((message) => message.ruleId === 'no-restricted-globals')).toBe(true)
})

it.each(['void import(target)', 'void import(`@/features/game/stores/useGameStore`)'])(
  'requires an inspectable string-literal module path: %s',
  async (source) => {
    const [result] = await lint.lintText(source, { filePath: 'src/core/sudoku/fixture.ts' })

    expect(result.messages.some((message) => message.ruleId === 'no-restricted-syntax')).toBe(true)
  },
)

function runtimeModules(source: string): readonly string[] {
  const syntax = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.Latest, true)
  const modules = new Set<string>()

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause
      const bindings = clause?.namedBindings
      const erased =
        clause?.isTypeOnly ||
        (!clause?.name &&
          bindings &&
          ts.isNamedImports(bindings) &&
          bindings.elements.length > 0 &&
          bindings.elements.every((binding) => binding.isTypeOnly))
      if (!erased) {
        modules.add(node.moduleSpecifier.text)
      }
    }

    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const exports = node.exportClause
      const erased =
        node.isTypeOnly ||
        (exports &&
          ts.isNamedExports(exports) &&
          exports.elements.length > 0 &&
          exports.elements.every((binding) => binding.isTypeOnly))
      if (!erased) {
        modules.add(node.moduleSpecifier.text)
      }
    }

    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const target = node.arguments[0]
      if (target && ts.isStringLiteral(target)) {
        modules.add(target.text)
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(syntax)

  return [...modules]
}

function findRuntimeCycle(graph: ReadonlyMap<string, readonly string[]>): readonly string[] | null {
  const visited = new Set<string>()
  const active = new Set<string>()
  const path: string[] = []

  function visit(module: string): readonly string[] | null {
    if (active.has(module)) {
      return [...path.slice(path.indexOf(module)), module]
    }
    if (visited.has(module)) {
      return null
    }

    active.add(module)
    path.push(module)
    for (const dependency of graph.get(module) ?? []) {
      const cycle = visit(dependency)
      if (cycle) {
        return cycle
      }
    }

    path.pop()
    active.delete(module)
    visited.add(module)

    return null
  }

  for (const module of graph.keys()) {
    const cycle = visit(module)
    if (cycle) {
      return cycle
    }
  }

  return null
}

it('recognizes runtime imports and exports while ignoring erased type dependencies', () => {
  const modules = runtimeModules(`
    import type { Board } from 'types-only'
    import { type RuleContext } from 'inline-types-only'
    export type { Technique } from 'exported-types-only'
    export { type LogicalStep } from 'inline-exported-types-only'
    import { maskOf, type Digit } from 'board'
    import 'side-effect'
    export { solve } from 'solver'
    export * from 'registry'
    void import('lazy')
  `)

  expect(modules).toEqual(['board', 'side-effect', 'solver', 'registry', 'lazy'])
})

it('finds an actual runtime cycle without rejecting a shared dependency', () => {
  const cyclic = new Map([
    ['first', ['second']],
    ['second', ['first']],
  ])
  const acyclic = new Map([
    ['first', ['shared']],
    ['second', ['shared']],
    ['shared', []],
  ])

  expect(findRuntimeCycle(cyclic)).toEqual(['first', 'second', 'first'])
  expect(findRuntimeCycle(acyclic)).toBeNull()
})

it('keeps the production Sudoku runtime import graph acyclic', () => {
  const root = resolve('src/core/sudoku')
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter(
    (file) => file.endsWith('.ts') && !file.endsWith('.test.ts'),
  )
  const graph = new Map(
    files.map((file) => {
      const path = `@/core/sudoku/${file.slice(0, -3)}`
      const dependencies = runtimeModules(readFileSync(resolve(root, file), 'utf8')).filter(
        (target) => target.startsWith('@/core/sudoku/'),
      )

      return [path, dependencies] as const
    }),
  )

  for (const dependencies of graph.values()) {
    for (const dependency of dependencies) {
      expect(graph.has(dependency), `Missing runtime dependency: ${dependency}`).toBe(true)
    }
  }

  expect(findRuntimeCycle(graph)).toBeNull()
})
