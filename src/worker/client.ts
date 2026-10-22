import type { ConflictComputationDto, EditComputationDto, Board } from '@/sudoku/contracts'
import type { HintResult } from '@/sudoku/contracts'
import type { PuzzleRules } from '@/sudoku/contracts'
import type { AssessmentInput, LiveAssessmentOutcome } from '@/sudoku/contracts'
import type { MainSudokuEngine } from '@/sudoku/mainEngine'
import { BRIDGE_VERSION } from '@/sudoku/guards'
import { isRecord } from '@/sudoku/values'
import { copyGenerationInput } from '@/sudoku/generationInput'
import type { GenerationInput } from '@/sudoku/generationInput'
import { copyRules } from '@/sudoku/ruleInput'
import { decodeSeed, equalSeeds } from '@/sudoku/seed'
import { parseWorkerResponse, validateHintEvidence } from '@/worker/protocol'
import type {
  GenerateNotesInput,
  LiveComputation,
  GenerateOutcome,
  WorkerOutcome,
  WorkerRequest,
  WorkerInitialize,
} from '@/worker/protocol'

const REQUEST_TIMEOUT_MILLISECONDS = 3000

type StartupResult = { status: 'ready' } | { status: 'failed'; message: string }

interface PreparedWorker {
  worker: Worker
  phase: 'initializing' | 'ready' | 'failed'
  failure: string | null
  ready: Promise<StartupResult>
  terminate(): void
}

export interface SudokuWorkerClient {
  conflicts(
    board: Board,
    rules: PuzzleRules,
    signal?: AbortSignal,
  ): Promise<WorkerOutcome<LiveComputation<ConflictComputationDto>>>
  generateNotes(
    input: GenerateNotesInput,
    signal?: AbortSignal,
  ): Promise<WorkerOutcome<LiveComputation<EditComputationDto>>>

  generate(input: GenerationInput, signal?: AbortSignal): Promise<GenerateOutcome>
  assess(
    input: AssessmentInput,
    signal?: AbortSignal,
  ): Promise<WorkerOutcome<LiveAssessmentOutcome>>
  hint(
    board: Board,
    solution: Board,
    rules: PuzzleRules,
    signal?: AbortSignal,
  ): Promise<WorkerOutcome<HintResult>>
  dispose(): void
}

/** Own idle and active instances. Only compiled code is shared; termination interrupts synchronous WASM. */
export function createSudokuWorkerClient(
  module: WebAssembly.Module,
  engine: MainSudokuEngine,
): SudokuWorkerClient {
  const cancellations = new Set<() => void>()
  let disposed = false
  let preparedWorker: PreparedWorker | null = null
  let preparationFailure: string | null = null

  function createPreparedWorker(): PreparedWorker {
    const worker = new Worker(new URL('./sudoku.worker.ts', import.meta.url), { type: 'module' })
    let settleStartup: ((result: StartupResult) => void) | undefined
    const ready = new Promise<StartupResult>((resolve) => {
      settleStartup = resolve
    })
    let terminated = false
    const prepared: PreparedWorker = {
      worker,
      ready,
      phase: 'initializing',
      failure: null,
      terminate() {
        if (terminated) {
          return
        }

        terminated = true
        worker.removeEventListener('message', control)
        worker.removeEventListener('error', startupError)
        finishStartup({ status: 'failed', message: prepared.failure ?? 'Worker was terminated' })
        worker.terminate()
      },
    }

    function finishStartup(result: StartupResult) {
      if (settleStartup) {
        const settle = settleStartup
        settleStartup = undefined
        settle(result)
      }
    }

    function failStartup(message: string) {
      prepared.phase = 'failed'
      prepared.failure = message
      finishStartup({ status: 'failed', message })
      prepared.terminate()
    }

    function startupError(event: ErrorEvent) {
      failStartup(event.message || 'Worker failed to start')
    }

    function control(event: MessageEvent<unknown>) {
      if (!isRecord(event.data)) {
        return
      }

      if (event.data.kind === 'initialization-failed' && typeof event.data.message === 'string') {
        failStartup(event.data.message)
      } else if (event.data.kind === 'ready') {
        if (event.data.bridgeVersion !== BRIDGE_VERSION) {
          failStartup('Worker engine bridge mismatch')
          return
        }

        prepared.phase = 'ready'
        worker.removeEventListener('message', control)
        finishStartup({ status: 'ready' })
      }
    }

    worker.addEventListener('message', control)
    worker.addEventListener('error', startupError)
    try {
      worker.postMessage({
        kind: 'initialize',
        bridgeVersion: BRIDGE_VERSION,
        module,
      } satisfies WorkerInitialize)
    } catch (error: unknown) {
      failStartup(error instanceof Error ? error.message : 'Could not initialize worker')
    }

    return prepared
  }

  function prepareWorker() {
    if (disposed || preparedWorker || preparationFailure) {
      return
    }

    try {
      preparedWorker = createPreparedWorker()
    } catch (error: unknown) {
      preparationFailure = error instanceof Error ? error.message : 'Worker unavailable'
    }
  }

  function takeWorker(): PreparedWorker {
    if (preparedWorker) {
      const prepared = preparedWorker
      preparedWorker = null

      return prepared
    }

    if (preparationFailure) {
      const message = preparationFailure
      preparationFailure = null
      throw new Error(message)
    }

    return createPreparedWorker()
  }

  function run<T>(
    request: WorkerRequest,
    decode: (value: unknown) => WorkerOutcome<T> | null,
    signal?: AbortSignal,
    timeoutMilliseconds = REQUEST_TIMEOUT_MILLISECONDS,
  ): Promise<WorkerOutcome<T>> {
    if (disposed || signal?.aborted) {
      return Promise.resolve({ status: 'cancelled' })
    }

    return new Promise((resolve) => {
      const deadline = performance.now() + timeoutMilliseconds
      let prepared: PreparedWorker
      try {
        prepared = takeWorker()
      } catch (error: unknown) {
        resolve({
          status: 'failed',
          message: error instanceof Error ? error.message : 'Worker unavailable',
        })
        prepareWorker()
        return
      }

      const worker = prepared.worker
      let settled = false
      // The original deadline includes initialization; readiness never resets this timer.
      const timeout = window.setTimeout(() => finish({ status: 'timed-out' }), timeoutMilliseconds)
      const cancel = () => finish({ status: 'cancelled' })

      function finish(outcome: WorkerOutcome<T>) {
        if (settled) {
          return
        }

        // Timers can be delayed by a busy event loop or synchronous reply validation.
        if (outcome.status === 'completed' && performance.now() >= deadline) {
          outcome = { status: 'timed-out' }
        }
        settled = true
        window.clearTimeout(timeout)
        signal?.removeEventListener('abort', cancel)
        worker.removeEventListener('message', receive)
        worker.removeEventListener('error', fail)
        cancellations.delete(cancel)
        prepared.terminate()
        resolve(outcome)
        prepareWorker()
      }

      function receive(event: MessageEvent<unknown>) {
        if (!isRecord(event.data) || event.data.requestId !== request.requestId) {
          return
        }

        if (performance.now() >= deadline) {
          finish({ status: 'timed-out' })
          return
        }
        try {
          finish(
            decode(event.data) ?? { status: 'failed', message: 'Worker returned malformed data' },
          )
        } catch (error: unknown) {
          finish(
            error instanceof Error && error.message === 'Computation timed out'
              ? { status: 'timed-out' }
              : {
                  status: 'failed',
                  message:
                    error instanceof Error ? error.message : 'Worker returned malformed data',
                },
          )
        }
      }

      function fail(event: ErrorEvent) {
        finish({ status: 'failed', message: event.message || 'Worker failed' })
      }

      function send() {
        if (settled) {
          return
        }
        if (performance.now() >= deadline) {
          finish({ status: 'timed-out' })
          return
        }
        if (prepared.failure) {
          finish({ status: 'failed', message: prepared.failure })
          return
        }

        try {
          worker.postMessage(request)
        } catch (error: unknown) {
          finish({
            status: 'failed',
            message: error instanceof Error ? error.message : 'Could not send worker request',
          })
        }
      }

      cancellations.add(cancel)
      signal?.addEventListener('abort', cancel, { once: true })
      worker.addEventListener('message', receive)
      worker.addEventListener('error', fail)

      if (signal?.aborted) {
        cancel()
        return
      }

      if (prepared.phase === 'ready' || prepared.failure) {
        send()
      } else {
        void prepared.ready.then((result) => {
          // Cancellation terminates this owner; a late ready reply must not send its job.
          if (settled) {
            return
          }

          if (result.status === 'ready') {
            send()
          } else {
            finish({ status: 'failed', message: result.message })
          }
        })
      }
    })
  }

  // Preload one isolated idle instance, without a puzzle job or a running request deadline.
  prepareWorker()

  return {
    conflicts(board, rules, signal) {
      const snapshot = { board: [...board], rules: copyRules(rules) }

      return run(
        { kind: 'conflicts', requestId: crypto.randomUUID(), ...snapshot },
        (value) => {
          const parsed = parseWorkerResponse(value, engine)
          return parsed.valid && parsed.value.kind === 'conflicts' ? parsed.value.outcome : null
        },
        signal,
      )
    },
    generateNotes(input, signal) {
      // Snapshot before run can await readiness; callers retain ownership of their mutable layers.
      const snapshot = {
        givens: [...input.givens],
        entries: [...input.entries],
        notes: [...input.notes],
        rules: copyRules(input.rules),
      }

      return run(
        { kind: 'generate-notes', requestId: crypto.randomUUID(), input: snapshot },
        (value) => {
          const parsed = parseWorkerResponse(value, engine)
          return parsed.valid && parsed.value.kind === 'generate-notes'
            ? parsed.value.outcome
            : null
        },
        signal,
      )
    },
    generate(input, signal) {
      const snapshot = copyGenerationInput(input)

      return run(
        { kind: 'generate', requestId: crypto.randomUUID(), input: snapshot },
        (value) => {
          const parsed = parseWorkerResponse(value, engine)
          if (!parsed.valid || parsed.value.kind !== 'generate') {
            return null
          }

          const outcome = parsed.value.outcome
          if (
            outcome.status === 'completed' &&
            (outcome.value.rules.kind !== snapshot.variant ||
              !equalSeeds(decodeSeed(outcome.value.seed), snapshot.seed) ||
              outcome.value.difficulty !== snapshot.difficulty ||
              outcome.value.puzzleVersion !== snapshot.puzzleVersion)
          ) {
            return null
          }

          return outcome
        },
        signal,
        REQUEST_TIMEOUT_MILLISECONDS,
      )
    },
    assess(input, signal) {
      const snapshot = {
        ...input,
        board: [...input.board],
        rules: copyRules(input.rules),
        limits: { ...input.limits },
      }

      return run(
        { kind: 'assess', requestId: crypto.randomUUID(), input: snapshot },
        (value) => {
          const parsed = parseWorkerResponse(value, engine)
          if (!parsed.valid || parsed.value.kind !== 'assess') {
            return null
          }

          const outcome = parsed.value.outcome
          if (outcome.status === 'completed' && outcome.value.status !== 'invalid') {
            const identity =
              outcome.value.status === 'rated' ? outcome.value.summary : outcome.value
            if (
              identity.variant !== snapshot.rules.kind ||
              identity.ratingVersion !== snapshot.ratingVersion
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
      const snapshot = { board: [...board], solution: [...solution], rules: copyRules(rules) }

      return run(
        { kind: 'hint', requestId: crypto.randomUUID(), ...snapshot },
        (value) => {
          const parsed = parseWorkerResponse(value, engine)
          if (!parsed.valid || parsed.value.kind !== 'hint') {
            return null
          }

          const outcome = parsed.value.outcome
          if (outcome.status !== 'completed') {
            return outcome
          }

          const hint = validateHintEvidence(outcome.value, snapshot.rules, snapshot.board, engine)
          return hint.valid ? { status: 'completed', value: hint.value } : null
        },
        signal,
      )
    },
    dispose() {
      if (disposed) {
        return
      }

      disposed = true
      preparedWorker?.terminate()
      preparedWorker = null
      preparationFailure = null

      for (const cancel of [...cancellations]) {
        cancel()
      }
    },
  }
}
