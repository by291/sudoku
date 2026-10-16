// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'

it.each(['v10-first', 'v11-first', 'concurrent'] as const)(
  'isolates_reference_module_graphs_for_%s',
  (order) => {
    const loader = new URL('./reference-loader.mjs', import.meta.url).href
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
    import assert from 'node:assert/strict'
    import { loadEngine } from ${JSON.stringify(loader)}
    let old
    let current
    if (${JSON.stringify(order)} === 'concurrent') {
      [current, old] = await Promise.all([loadEngine({ v11: true }), loadEngine()])
    } else if (${JSON.stringify(order)} === 'v11-first') {
      current = await loadEngine({ v11: true })
      old = await loadEngine()
    } else {
      old = await loadEngine()
      current = await loadEngine({ v11: true })
    }
    const oldInput = old.createGenerationInput('classic', 'easy', 'fixture')
    assert.equal(oldInput.puzzleVersion, 'sudoku-v10')
    const input = current.createGenerationInput('classic', 'easy', '07'.repeat(32))
    assert.equal(input.puzzleVersion, 'sudoku-v11')
    assert.equal(current.generatePuzzle(input).status, 'ready')
    assert.equal(old.createGenerationInput('classic', 'easy', 'fixture').puzzleVersion, 'sudoku-v10')
  `,
      ],
      { encoding: 'utf8' },
    )

    expect(result.stderr).not.toContain('Unsupported generation version')
    expect(result.status, result.stderr).toBe(0)
  },
)

it('keeps_recipe_ownership_exclusive_when_a_v10_hook_is_registered_last', () => {
  const loader = new URL('./reference-loader.mjs', import.meta.url).href
  const entry = new URL(
    '../reference/typescript-engine/src/core/sudoku/generation/input.ts?sudoku-reference-recipe=v11&registration-order=late-v10',
    import.meta.url,
  ).href
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict'
    import { registerReference } from ${JSON.stringify(loader)}
    registerReference({ v11: true })
    registerReference()
    const current = await import(${JSON.stringify(entry)})
    assert.equal(current.createGenerationInput('classic', 'easy', '07'.repeat(32)).puzzleVersion, 'sudoku-v11')
  `,
    ],
    { encoding: 'utf8' },
  )

  expect(result.status, result.stderr).toBe(0)
})
