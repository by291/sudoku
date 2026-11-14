import type { SudokuWorkerClient } from '@/worker/client'
import { REQUEST_TIMEOUT_MILLISECONDS, setRequestDeadline } from '@/worker/deadline'

type StartupOutcome =
  { status: 'cancelled' } | { status: 'timed-out' } | { status: 'failed'; message: string }

/** Defers computation without retaining caller-owned request data across initialization. */
export function createLazyWorkerClient(
  prepare: () => Promise<SudokuWorkerClient>,
): SudokuWorkerClient {
  let disposed = false
  const cancellations = new Set<() => void>()

  function run<T>(
    operation: (client: SudokuWorkerClient, requestSignal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T | StartupOutcome> {
    if (disposed || signal?.aborted) {
      return Promise.resolve({ status: 'cancelled' })
    }

    return new Promise((resolve) => {
      let settled = false
      const deadline = performance.now() + REQUEST_TIMEOUT_MILLISECONDS
      const request = new AbortController()
      setRequestDeadline(request.signal, deadline)
      const timeout = window.setTimeout(expire, REQUEST_TIMEOUT_MILLISECONDS)

      function finish(result: T | StartupOutcome) {
        if (settled) {
          return
        }

        settled = true
        window.clearTimeout(timeout)
        cancellations.delete(cancel)
        signal?.removeEventListener('abort', cancel)
        resolve(result)
      }

      function cancel() {
        finish({ status: 'cancelled' })
        request.abort()
      }

      function expire() {
        finish({ status: 'timed-out' })
        request.abort()
      }

      cancellations.add(cancel)
      signal?.addEventListener('abort', cancel, { once: true })

      if (signal?.aborted) {
        cancel()
        return
      }

      // The request can expire while other callers still need the shared initialization.
      async function dispatch() {
        try {
          const client = await prepare()
          if (settled) {
            return
          }

          if (performance.now() >= deadline) {
            expire()
            return
          }

          const result = await operation(client, request.signal)
          if (performance.now() >= deadline) {
            expire()
            return
          }

          finish(result)
        } catch (error: unknown) {
          if (performance.now() >= deadline) {
            expire()
            return
          }

          finish({
            status: 'failed',
            message: error instanceof Error ? error.message : 'Computation unavailable',
          })
        }
      }

      void dispatch()
    })
  }

  return {
    conflicts(board, rules, signal) {
      const snapshot = structuredClone({ board, rules })
      return run(
        (client, requestSignal) => client.conflicts(snapshot.board, snapshot.rules, requestSignal),
        signal,
      )
    },
    generateNotes(input, signal) {
      const snapshot = structuredClone(input)
      return run((client, requestSignal) => client.generateNotes(snapshot, requestSignal), signal)
    },
    generate(input, signal) {
      const snapshot = structuredClone(input)
      return run((client, requestSignal) => client.generate(snapshot, requestSignal), signal)
    },
    assess(input, signal) {
      const snapshot = structuredClone(input)
      return run((client, requestSignal) => client.assess(snapshot, requestSignal), signal)
    },
    hint(board, solution, rules, signal) {
      const snapshot = structuredClone({
        board,
        solution,
        rules,
      })
      return run(
        (client, requestSignal) =>
          client.hint(snapshot.board, snapshot.solution, snapshot.rules, requestSignal),
        signal,
      )
    },
    dispose() {
      disposed = true
      for (const cancel of [...cancellations]) {
        cancel()
      }
    },
  }
}
