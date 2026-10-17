import type { SudokuWorkerClient } from '@/worker/client'

/** Defers computation without retaining caller-owned request data across initialization. */
export function createLazyWorkerClient(
  prepare: () => Promise<SudokuWorkerClient>,
): SudokuWorkerClient {
  let disposed = false
  const cancellations = new Set<() => void>()

  function run<T>(
    operation: (client: SudokuWorkerClient) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T | { status: 'cancelled' } | { status: 'failed'; message: string }> {
    if (disposed || signal?.aborted) {
      return Promise.resolve({ status: 'cancelled' })
    }

    return new Promise((resolve) => {
      let settled = false
      function finish(result: T | { status: 'cancelled' } | { status: 'failed'; message: string }) {
        if (settled) {
          return
        }
        settled = true
        cancellations.delete(cancel)
        signal?.removeEventListener('abort', cancel)
        resolve(result)
      }
      function cancel() {
        finish({ status: 'cancelled' })
      }

      cancellations.add(cancel)
      signal?.addEventListener('abort', cancel, { once: true })
      void prepare()
        .then(async (client) => {
          if (!settled) {
            finish(await operation(client))
          }
        })
        .catch((error: unknown) => {
          finish({
            status: 'failed',
            message: error instanceof Error ? error.message : 'Computation unavailable',
          })
        })
    })
  }

  return {
    conflicts(board, rules, signal) {
      const snapshot = structuredClone({ board, rules })
      return run((client) => client.conflicts(snapshot.board, snapshot.rules, signal), signal)
    },
    generateNotes(input, signal) {
      const snapshot = structuredClone(input)
      return run((client) => client.generateNotes(snapshot, signal), signal)
    },
    generate(input, signal) {
      const snapshot = structuredClone(input)
      return run((client) => client.generate(snapshot, signal), signal)
    },
    assess(input, signal) {
      const snapshot = structuredClone(input)
      return run((client) => client.assess(snapshot, signal), signal)
    },
    hint(board, solution, rules, signal) {
      const snapshot = structuredClone({ board, solution, rules })
      return run(
        (client) => client.hint(snapshot.board, snapshot.solution, snapshot.rules, signal),
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
