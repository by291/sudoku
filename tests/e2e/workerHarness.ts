import { readdirSync } from 'node:fs'
import type { Page } from '@playwright/test'
import type { WorkerRequest } from '@/worker/protocol'

export async function runWorker(page: Page, request: WorkerRequest, base: '/' | '/sudoku/' = '/') {
  const directory = base === '/' ? 'dist/assets' : 'dist-subpath/assets'
  const asset = readdirSync(directory).find(
    (file) => file.startsWith('sudoku.worker-') && file.endsWith('.js'),
  )
  if (!asset) {
    throw new Error('Build the production worker before browser tests')
  }

  return page.evaluate(
    ({ url, request }) =>
      new Promise<unknown>((resolve, reject) => {
        const worker = new Worker(url, { type: 'module' })
        const timer = setTimeout(() => {
          worker.terminate()
          reject(new Error('Real worker timed out'))
        }, 15000)
        worker.onmessage = (event: MessageEvent<unknown>) => {
          clearTimeout(timer)
          worker.terminate()
          resolve(event.data)
        }
        worker.onerror = (event) => {
          clearTimeout(timer)
          worker.terminate()
          reject(new Error(event.message))
        }
        worker.postMessage(request)
      }),
    { url: `${base}assets/${asset}`, request },
  )
}
