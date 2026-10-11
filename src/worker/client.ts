import type { Board } from '@/core/sudoku/types'
import type { GenerationInput, Puzzle } from '@/core/sudoku/generation'
import type { HintResult } from '@/core/sudoku/hint'
import type { WorkerOutcome } from '@/worker/protocol'
import { parseWorkerResponse } from '@/worker/protocol'
import type { WorkerRequest } from '@/worker/protocol'
import { isRecord } from '@/core/sudoku/types'
export interface SudokuWorkerClient {
  generate(input: GenerationInput, signal?: AbortSignal): Promise<WorkerOutcome<Puzzle>>
  hint(board: Board, solution: Board, signal?: AbortSignal): Promise<WorkerOutcome<HintResult>>
  dispose(): void
}
export function createSudokuWorkerClient(): SudokuWorkerClient {
  const cancellations = new Set<() => void>()
  let disposed = false
  function run<T>(
    request: WorkerRequest,
    decode: (value: unknown) => WorkerOutcome<T> | null,
    signal?: AbortSignal,
  ): Promise<WorkerOutcome<T>> {
    if (disposed || signal?.aborted) return Promise.resolve({ status: 'cancelled' })
    return new Promise((resolve) => {
      let worker: Worker
      try {
        worker = new Worker(new URL('./sudoku.worker.ts', import.meta.url), { type: 'module' })
      } catch (error) {
        resolve({
          status: 'failed',
          message: error instanceof Error ? error.message : 'Worker unavailable',
        })
        return
      }
      let settled = false
      const timeout = window.setTimeout(() => finish({ status: 'timed-out' }), 15000)
      const cancel = () => finish({ status: 'cancelled' })
      function finish(outcome: WorkerOutcome<T>) {
        if (settled) return
        settled = true
        window.clearTimeout(timeout)
        signal?.removeEventListener('abort', cancel)
        worker.removeEventListener('message', receive)
        worker.removeEventListener('error', fail)
        cancellations.delete(cancel)
        worker.terminate()
        resolve(outcome)
      }
      function receive(event: MessageEvent<unknown>) {
        if (!isRecord(event.data) || event.data.requestId !== request.requestId) return
        const outcome = decode(event.data)
        finish(outcome ?? { status: 'failed', message: 'Worker returned malformed data' })
      }
      function fail(event: ErrorEvent) {
        finish({ status: 'failed', message: event.message || 'Worker failed' })
      }
      cancellations.add(cancel)
      signal?.addEventListener('abort', cancel, { once: true })
      worker.addEventListener('message', receive)
      worker.addEventListener('error', fail)
      try {
        worker.postMessage(request)
      } catch (error) {
        finish({
          status: 'failed',
          message: error instanceof Error ? error.message : 'Could not send worker request',
        })
      }
    })
  }
  return {
    generate(input, signal) {
      return run(
        { kind: 'generate', requestId: crypto.randomUUID(), input },
        (value) => {
          const parsed = parseWorkerResponse(value)
          return parsed.valid && parsed.value.kind === 'generate' ? parsed.value.outcome : null
        },
        signal,
      )
    },
    hint(board, solution, signal) {
      return run(
        { kind: 'hint', requestId: crypto.randomUUID(), board, solution },
        (value) => {
          const parsed = parseWorkerResponse(value)
          return parsed.valid && parsed.value.kind === 'hint' ? parsed.value.outcome : null
        },
        signal,
      )
    },
    dispose() {
      disposed = true
      for (const cancel of [...cancellations]) cancel()
    },
  }
}
