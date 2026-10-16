import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { writeFile } from 'node:fs/promises'
import { createServer } from 'vite'
import type { ViteDevServer } from 'vite'

let server: ViteDevServer
let origin: string

test.beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: process.cwd(),
    resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
    server: { host: '127.0.0.1', port: 0, hmr: false },
    optimizeDeps: { entries: ['tests/migration/wasm-smoke.html'] },
    logLevel: 'error',
  })
  await server.listen()
  const address = server.httpServer?.address()
  if (!address || typeof address === 'string') {
    throw new Error('Missing profiling server')
  }
  origin = `http://127.0.0.1:${address.port}`
})

test.afterAll(async () => {
  await server?.close()
})

test(
  'bounded live operations stay within the main-thread frame budget',
  { tag: '@performance' },
  async ({ page }, info) => {
    await page.goto(`${origin}/tests/migration/wasm-smoke.html`)
    const profiles: unknown = await page.evaluate(async () => {
      const url = '/tests/migration/live-profile.ts'
      const module: unknown = await import(url)
      if (
        !module ||
        typeof module !== 'object' ||
        !('profileLiveOperations' in module) ||
        typeof module.profileLiveOperations !== 'function'
      ) {
        throw new Error('Missing profiling entry point')
      }
      return module.profileLiveOperations()
    })
    await writeFile(
      info.outputPath('live-operation-profiles.json'),
      JSON.stringify(profiles, null, 2),
    )
    await info.attach('live-operation-profiles', {
      body: JSON.stringify(profiles, null, 2),
      contentType: 'application/json',
    })

    expect(Array.isArray(profiles)).toBe(true)
    if (!Array.isArray(profiles)) {
      throw new Error('Invalid profiling response')
    }
    expect(profiles).toHaveLength(61)
    for (const profile of profiles) {
      expect(profile.p95Ms, `${profile.variant}/${profile.operation} p95`).toBeLessThan(16.67)
      expect(profile.maxMs, `${profile.variant}/${profile.operation} maximum`).toBeLessThan(50)
    }
  },
)

test('preserves optional unit fields without mutating caller proofs', async ({ page }) => {
  await page.goto(`${origin}/tests/migration/wasm-smoke.html`)
  const result: unknown = await page.evaluate(async () => {
    const url = '/tests/migration/live-profile.ts'
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
