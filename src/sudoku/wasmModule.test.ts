import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { loadSudokuModule } from '@/sudoku/wasmModule'
import { validateEngineInfo } from '@/sudoku/guards'

afterEach(() => vi.unstubAllGlobals())

it('rejects_unavailable_assets_before_module_instantiation', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))

  await expect(loadSudokuModule()).rejects.toThrow('404')
})

it('retry_compiles_fresh_code_after_a_failed_download', async () => {
  const bytes = new Uint8Array(readFileSync('packages/sudoku-wasm/pkg/sudoku_wasm_bg.wasm'))
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => bytes.buffer })
  vi.stubGlobal('fetch', fetch)

  await expect(loadSudokuModule()).rejects.toThrow('Offline')
  const module = await loadSudokuModule()

  expect(module).toBeInstanceOf(WebAssembly.Module)
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('rejects_every_incompatible_algorithm_identity', () => {
  const valid = {
    bridgeVersion: 1,
    puzzleVersion: 'sudoku-v11',
    variantPuzzleVersion: 'sudoku-variants-v11',
    ratingVersion: 'sudoku-rating-v2',
  }

  expect(() => validateEngineInfo(valid)).not.toThrow()
  for (const change of [
    { bridgeVersion: 2 },
    { puzzleVersion: 'sudoku-v10' },
    { variantPuzzleVersion: 'sudoku-variants-v10' },
    { ratingVersion: 'unknown' },
  ]) {
    expect(() => validateEngineInfo({ ...valid, ...change })).toThrow(/mismatch/)
  }
})
