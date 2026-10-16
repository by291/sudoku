import { test, expect } from '@playwright/test'
import { createServer } from 'vite'
import type { ViteDevServer } from 'vite'
import type { EngineInfo } from '@sudoku/wasm'

let server: ViteDevServer
let origin: string

test.beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: process.cwd(),
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'error',
    optimizeDeps: { entries: ['tests/migration/wasm-smoke.html'] },
  })
  await server.listen()
  const address = server.httpServer?.address()
  if (!address || typeof address === 'string') {
    throw new Error('The WASM fixture server did not open a port')
  }
  origin = `http://127.0.0.1:${address.port}`
})

test.afterAll(async () => {
  await server?.close()
})

test('loads the generated WASM library and reports typed algorithm identities', async ({
  page,
}) => {
  await page.goto(`${origin}/tests/migration/wasm-smoke.html`)

  const info: unknown = await page.evaluate(async () => {
    const url = '/packages/sudoku-wasm/pkg/sudoku_wasm.js'
    const module: unknown = await import(url)
    if (
      !module ||
      typeof module !== 'object' ||
      !('default' in module) ||
      typeof module.default !== 'function' ||
      !('engine_info' in module) ||
      typeof module.engine_info !== 'function'
    ) {
      throw new Error('Missing generated WASM initialization or engine_info export')
    }
    await module.default()
    const info: unknown = module.engine_info()
    return info
  })

  const expected: EngineInfo = {
    bridgeVersion: 1,
    puzzleVersion: 'sudoku-v11',
    variantPuzzleVersion: 'sudoku-variants-v11',
    ratingVersion: 'sudoku-rating-v2',
  }
  expect(info).toEqual(expected)
})
