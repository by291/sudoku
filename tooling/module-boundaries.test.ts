// @vitest-environment node
import { ESLint } from 'eslint'
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
    ['src/core/sudoku/fixture.ts', 'vue'],
    ['src/core/sudoku/fixture.ts', 'naive-ui'],
    ['src/core/sudoku/fixture.ts', '@/shared/components/SudokuBoard.vue'],
    ['src/core/sudoku/fixture.ts', '@/infrastructure/runtime'],
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
    ['src/features/game/model/fixture.ts', 'pinia'],
    ['src/features/learning/model/fixture.ts', '@/features/learning/stores/useLearningStore'],
    ['src/infrastructure/fixture.ts', '@/features/game/stores/useGameStore'],
    ['src/infrastructure/fixture.ts', '@/layouts/AppLayout.vue'],
    ['src/storage/fixture.ts', '@/features/game/stores/useGameStore'],
    ['src/storage/fixture.ts', '@/router'],
    ['src/worker/fixture.ts', '@/features/game/views/GameView.vue'],
    ['src/worker/fixture.ts', '@/theme/useTheme'],
    ['src/features/game/stores/fixture.ts', '../model/session'],
  ])('rejects %s importing %s', async (filePath, target) => {
    expect((await boundaryMessages(filePath, target, kind)).length).toBeGreaterThan(0)
  })

  it.each([
    ['src/core/sudoku/fixture.ts', '@/core/sudoku/types'],
    ['src/shared/components/Fixture.vue', '@/core/sudoku/types'],
    ['src/shared/components/Fixture.vue', 'naive-ui'],
    ['src/features/game/stores/fixture.ts', '@/infrastructure/runtime'],
    ['src/features/game/views/Fixture.vue', '@/shared/components/SudokuBoard.vue'],
    ['src/features/game/model/fixture.ts', '@/core/sudoku/board'],
    ['src/features/records/model/fixture.ts', '@/features/game/model/session'],
    ['src/infrastructure/fixture.ts', '@/features/game/model/session'],
    ['src/storage/fixture.ts', '@/features/game/model/session'],
    ['src/storage/fixture.ts', '@/infrastructure/ownership'],
    ['src/worker/fixture.ts', '@/core/sudoku/generation'],
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
