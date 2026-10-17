import { resolve } from 'node:path'
import { createServer } from 'vite'
import { chromium, firefox, webkit } from '@playwright/test'
import { loadEngine } from './reference-loader.mjs'

export async function createWasmAdapter(browserName) {
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    resolve: { alias: { '@': resolve(process.cwd(), 'src') } },
    server: { host: '127.0.0.1', port: 0, hmr: false },
    logLevel: 'error',
    optimizeDeps: { entries: ['tests/migration/wasm-smoke.html'] },
  })
  let browser
  try {
    await server.listen()
    const address = server.httpServer.address()
    if (!address || typeof address === 'string') {
      throw new Error('Missing migration server port')
    }
    browser = await { chromium, firefox, webkit }[browserName].launch()
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${address.port}/tests/migration/wasm-smoke.html`)
    const reference = await loadEngine({ v11: true })
    const policies = Object.fromEntries(
      ['classic', 'diagonal', 'jigsaw', 'killer', 'thermo', 'arrow'].map((kind) => [
        kind,
        kind === 'classic'
          ? reference.ALL_CLASSIC_TECHNIQUES
          : reference.RATING_POLICIES[kind].hard,
      ]),
    )
    return {
      results: (suite, rows) =>
        page.evaluate(
          async ({ suite, rows, policies }) => {
            const { computeCase } = await import('/tests/migration/browser-compute.mjs')
            return rows.map((row) => computeCase(suite, row.input, policies))
          },
          { suite, rows, policies },
        ),
      close: async () => {
        try {
          await browser.close()
        } finally {
          await server.close()
        }
      },
    }
  } catch (error) {
    await browser?.close()
    await server.close()
    throw error
  }
}
