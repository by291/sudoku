import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import type { ViteDevServer } from 'vite'

let server: ViteDevServer
let origin: string

test.beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: process.cwd(),
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('../../src', import.meta.url)),
        '@resources': fileURLToPath(new URL('../../resources', import.meta.url)),
      },
    },
    server: { host: '127.0.0.1', port: 0, hmr: false },
    optimizeDeps: { entries: ['tests/browser/wasm-smoke.html'] },
    logLevel: 'error',
  })
  await server.listen()
  const address = server.httpServer?.address()
  if (!address || typeof address === 'string') {
    throw new Error('Missing WASM input test server')
  }
  origin = `http://127.0.0.1:${address.port}`
})

test.afterAll(async () => {
  await server?.close()
})

test('preserves optional unit fields without mutating caller proofs', async ({ page }) => {
  await page.goto(`${origin}/tests/browser/wasm-smoke.html`)
  const result: unknown = await page.evaluate(async () => {
    const url = '/tests/browser/optional-unit-fields.ts'
    const module: unknown = await import(url)
    if (
      !module ||
      typeof module !== 'object' ||
      !('probeOptionalUnitFields' in module) ||
      typeof module.probeOptionalUnitFields !== 'function'
    ) {
      throw new Error('Missing optional-field probe')
    }
    return module.probeOptionalUnitFields()
  })

  expect(result).toEqual({
    teaching: 'valid',
    shape: 'valid',
    proof: 'valid',
    nullTeaching: 'invalid',
    nullShape: 'invalid',
    nullProof: 'invalid',
    originalUnchanged: true,
  })
})
