import { readdirSync } from 'node:fs'
import type { Page } from '@playwright/test'
import type { Board, PuzzleRules, HintResult } from '@/sudoku/contracts'
import {
  parseWorkerResponse as decodeResponse,
  validateHintEvidence as validateEvidence,
} from '@/worker/protocol'
import type { WorkerRequest } from '@/worker/protocol'
import { createTestEngine } from '../support/wasm'

// One Node-side transport validator per Playwright process. Mathematical oracles remain separate.
const validator = await createTestEngine()
process.once('exit', () => validator.dispose())
export const parseWorkerResponse = (value: unknown) => decodeResponse(value, validator)
export const validateHintEvidence = (hint: HintResult, rules: PuzzleRules, board?: Board) =>
  validateEvidence(hint, rules, board, validator)

export async function runWorker(page: Page, request: WorkerRequest, base: '/' | '/sudoku/' = '/') {
  const directory = base === '/' ? 'dist/assets' : 'dist-subpath/assets'
  const files = readdirSync(directory)
  const asset = files.find((file) => file.startsWith('sudoku.worker-') && file.endsWith('.js'))
  const binary = files.find((file) => file.startsWith('sudoku_wasm_bg-') && file.endsWith('.wasm'))
  if (!asset || !binary) {
    throw new Error('Build the production worker and WASM before browser tests')
  }
  // Playwright transport is not Worker structured clone; reconstruct binary input in the page.
  const payload =
    request.kind === 'generate'
      ? { ...request, input: { ...request.input, seed: Array.from(request.input.seed) } }
      : request

  return page.evaluate(
    async ({ url, binaryUrl, request }) => {
      const response = await fetch(binaryUrl)
      if (!response.ok) {
        throw new Error('Missing emitted WASM binary')
      }
      const module = await WebAssembly.compile(await response.arrayBuffer())
      const job =
        request.kind === 'generate'
          ? { ...request, input: { ...request.input, seed: new Uint8Array(request.input.seed) } }
          : request
      return new Promise<unknown>((resolve, reject) => {
        const worker = new Worker(url, { type: 'module' })
        let sent = false
        const timer = setTimeout(() => {
          worker.terminate()
          reject(new Error('Real worker timed out'))
        }, 15000)
        function fail(message: string) {
          clearTimeout(timer)
          worker.terminate()
          reject(new Error(message))
        }
        worker.onmessage = (event: MessageEvent<unknown>) => {
          const data = event.data
          if (typeof data !== 'object' || data === null || !('kind' in data)) {
            fail('Malformed Worker envelope')
            return
          }
          if (data.kind === 'ready') {
            if (!('bridgeVersion' in data) || data.bridgeVersion !== 4) {
              fail('Worker bridge mismatch')
              return
            }
            if (!sent) {
              sent = true
              worker.postMessage(job)
            }
            return
          }
          if (data.kind === 'initialization-failed') {
            fail(
              'message' in data && typeof data.message === 'string'
                ? data.message
                : 'Worker initialization failed',
            )
            return
          }
          if (!('requestId' in data) || data.requestId !== request.requestId) {
            return
          }
          clearTimeout(timer)
          worker.terminate()
          resolve(data)
        }
        worker.onerror = (event) => fail(event.message)
        worker.postMessage({ kind: 'initialize', bridgeVersion: 4, module })
      })
    },
    { url: `${base}assets/${asset}`, binaryUrl: `${base}assets/${binary}`, request: payload },
  )
}
