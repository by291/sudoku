import type { Board } from '@/core/sudoku/types'
import type { GenerationInput } from '@/core/sudoku/generation'
import type { HintResult } from '@/core/sudoku/hint'
import type { GenerateOutcome, WorkerOutcome } from '@/worker/protocol'
import { parseWorkerResponse, validateHintEvidence } from '@/worker/protocol'
import type { WorkerRequest } from '@/worker/protocol'
import { isRecord } from '@/core/sudoku/types'
import type { PuzzleRules } from '@/core/sudoku/rules'
import type { AssessmentInput, AssessmentOutcome } from '@/core/sudoku/rating'

const GENERATION_TIMEOUT_MILLISECONDS = 3000
const COMPUTATION_TIMEOUT_MILLISECONDS = 15000

interface PreparedWorker {
  worker: Worker
  failure: string | null
  observeError: (event: ErrorEvent) => void
}

export interface SudokuWorkerClient {
  generate(input: GenerationInput, signal?: AbortSignal): Promise<GenerateOutcome>
  assess(input: AssessmentInput, signal?: AbortSignal): Promise<WorkerOutcome<AssessmentOutcome>>
  hint(
    board: Board,
    solution: Board,
    rules: PuzzleRules,
    signal?: AbortSignal,
  ): Promise<WorkerOutcome<HintResult>>
  dispose(): void
}

/** Owns idle and active Workers; dispose the client when its application runtime ends. */
export function createSudokuWorkerClient(): SudokuWorkerClient {
  const cancellations = new Set<() => void>()
  let disposed = false
  let preparedWorker: PreparedWorker | null = null
  let preparationFailure: string | null = null

  function createWorker(): Worker {
    return new Worker(new URL('./sudoku.worker.ts', import.meta.url), { type: 'module' })
  }

  function prepareWorker() {
    if (disposed || preparedWorker || preparationFailure) {
      return
    }

    try {
      const worker = createWorker()
      const prepared: PreparedWorker = {
        worker,
        failure: null,
        observeError(event) {
          prepared.failure = event.message || 'Worker failed to start'
          worker.terminate()
        },
      }
      worker.addEventListener('error', prepared.observeError)
      preparedWorker = prepared
    } catch (error) {
      preparationFailure = error instanceof Error ? error.message : 'Worker unavailable'
    }
  }

  function takeWorker(): Worker {
    const prepared = preparedWorker
    preparedWorker = null
    if (prepared) {
      prepared.worker.removeEventListener('error', prepared.observeError)
      if (prepared.failure) {
        throw new Error(prepared.failure)
      }

      return prepared.worker
    }

    if (preparationFailure) {
      const message = preparationFailure
      preparationFailure = null
      throw new Error(message)
    }

    return createWorker()
  }

  function run<T>(
    request: WorkerRequest,
    decode: (value: unknown) => WorkerOutcome<T> | null,
    signal?: AbortSignal,
    timeoutMilliseconds = COMPUTATION_TIMEOUT_MILLISECONDS,
  ): Promise<WorkerOutcome<T>> {
    if (disposed || signal?.aborted) {
      return Promise.resolve({ status: 'cancelled' })
    }

    return new Promise((resolve) => {
      let worker: Worker
      try {
        worker = takeWorker()
      } catch (error) {
        resolve({
          status: 'failed',
          message: error instanceof Error ? error.message : 'Worker unavailable',
        })
        prepareWorker()

        return
      }
      let settled = false
      const timeout = window.setTimeout(() => finish({ status: 'timed-out' }), timeoutMilliseconds)
      const cancel = () => finish({ status: 'cancelled' })

      function finish(outcome: WorkerOutcome<T>) {
        // Abort, timeout and reply can race; settle once and dispose the per-job worker together.
        if (settled) {
          return
        }

        settled = true
        window.clearTimeout(timeout)
        signal?.removeEventListener('abort', cancel)
        worker.removeEventListener('message', receive)
        worker.removeEventListener('error', fail)
        cancellations.delete(cancel)
        worker.terminate()
        resolve(outcome)
        prepareWorker()
      }

      function receive(event: MessageEvent<unknown>) {
        if (!isRecord(event.data) || event.data.requestId !== request.requestId) {
          return
        }

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

  // Load one idle worker ahead of interaction to reduce cold startup within the job's deadline.
  // It computes nothing before a validated request and remains owned by this client's disposal.
  prepareWorker()

  return {
    generate(input, signal) {
      return run(
        { kind: 'generate', requestId: crypto.randomUUID(), input },
        (value) => {
          const parsed = parseWorkerResponse(value)
          if (!parsed.valid || parsed.value.kind !== 'generate') {
            return null
          }

          const outcome = parsed.value.outcome
          if (
            outcome.status === 'completed' &&
            (outcome.value.rules.kind !== input.variant ||
              outcome.value.seed !== input.seed ||
              outcome.value.difficulty !== input.difficulty ||
              outcome.value.puzzleVersion !== input.puzzleVersion)
          ) {
            return null
          }

          return outcome
        },
        signal,
        GENERATION_TIMEOUT_MILLISECONDS,
      )
    },
    assess(input, signal) {
      return run(
        { kind: 'assess', requestId: crypto.randomUUID(), input },
        (value) => {
          const parsed = parseWorkerResponse(value)
          if (!parsed.valid || parsed.value.kind !== 'assess') {
            return null
          }

          const outcome = parsed.value.outcome
          if (outcome.status === 'completed' && outcome.value.status !== 'invalid') {
            const identity =
              outcome.value.status === 'rated' ? outcome.value.summary : outcome.value
            if (
              identity.variant !== input.rules.kind ||
              identity.ratingVersion !== input.ratingVersion
            ) {
              return null
            }
          }

          return outcome
        },
        signal,
      )
    },
    hint(board, solution, rules, signal) {
      return run(
        { kind: 'hint', requestId: crypto.randomUUID(), board, solution, rules },
        (value) => {
          const parsed = parseWorkerResponse(value)
          if (!parsed.valid || parsed.value.kind !== 'hint') {
            return null
          }

          const outcome = parsed.value.outcome
          if (outcome.status !== 'completed') {
            return outcome
          }

          const hint = validateHintEvidence(outcome.value, rules, board)

          return hint.valid ? { status: 'completed', value: hint.value } : null
        },
        signal,
      )
    },
    dispose() {
      disposed = true
      if (preparedWorker) {
        preparedWorker.worker.removeEventListener('error', preparedWorker.observeError)
        preparedWorker.worker.terminate()
        preparedWorker = null
      }
      preparationFailure = null

      for (const cancel of [...cancellations]) {
        cancel()
      }
    },
  }
}
