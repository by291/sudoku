import { readdirSync } from 'node:fs'
import type { Page } from '@playwright/test'
import type { Board } from '@reference/core/sudoku/types'
import type { PuzzleRules } from '@reference/core/sudoku/rules/types'
import type { HintResult } from '@reference/core/sudoku/hint'
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
            if (!('bridgeVersion' in data) || data.bridgeVersion !== 2) {
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
        worker.postMessage({ kind: 'initialize', bridgeVersion: 2, module })
      })
    },
    { url: `${base}assets/${asset}`, binaryUrl: `${base}assets/${binary}`, request: payload },
  )
}

let referenceEngine: Promise<unknown> | null = null

/** Compare transport with the frozen independent TS engine using its isolated v11 byte recipe. */
export async function generateReference(input: import('@/sudoku/generationInput').GenerationInput) {
  const { isRecord } = await import('@/sudoku/guards')
  if (!referenceEngine) {
    referenceEngine = (async () => {
      const url = new URL('../migration/reference-loader.mjs', import.meta.url).href
      const loader: unknown = await import(url)
      if (!isRecord(loader) || typeof loader.loadEngine !== 'function') {
        throw new Error('Missing frozen reference loader')
      }
      const loaded: unknown = await loader.loadEngine({ v11: true })
      return loaded
    })()
  }
  const reference = await referenceEngine
  if (
    !isRecord(reference) ||
    typeof reference.createGenerationInput !== 'function' ||
    typeof reference.generatePuzzle !== 'function'
  ) {
    throw new Error('Missing frozen generation functions')
  }
  const request: unknown = reference.createGenerationInput(
    input.variant,
    input.difficulty,
    Buffer.from(input.seed).toString('hex'),
  )
  const generated: unknown = reference.generatePuzzle(request)
  if (!isRecord(generated) || generated.status !== 'ready') {
    throw new Error('Independent v11 reference did not construct this fixed fixture')
  }
  const parsed = parseWorkerResponse({
    kind: 'generate',
    requestId: 'reference',
    outcome: {
      status: 'completed',
      value: generated.puzzle,
      assessment: { status: 'rated', summary: generated.assessment },
    },
  })
  if (
    !parsed.valid ||
    parsed.value.kind !== 'generate' ||
    parsed.value.outcome.status !== 'completed' ||
    parsed.value.outcome.assessment?.status !== 'rated'
  ) {
    throw new Error('Malformed frozen reference result')
  }
  return {
    status: 'ready' as const,
    puzzle: parsed.value.outcome.value,
    assessment: parsed.value.outcome.assessment.summary,
  }
}
