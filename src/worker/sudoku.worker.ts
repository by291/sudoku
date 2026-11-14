import { createWorkerEngine } from '@/sudoku/workerEngine'
import { BRIDGE_VERSION } from '@/sudoku/guards'
import { isRecord } from '@/sudoku/values'
import { parseWorkerRequest } from '@/worker/protocol'
import { isWasmTimeout } from '@/worker/deadline'
import type {
  GenerateOutcome,
  WorkerInitializationFailed,
  WorkerReady,
  WorkerRequest,
  WorkerResponse,
} from '@/worker/protocol'

type WorkerEngine = Awaited<ReturnType<typeof createWorkerEngine>>
type GenerationResult = ReturnType<WorkerEngine['generate']>

let engine: WorkerEngine | null = null
let initializationStarted = false

function reportInitializationFailure(message: string) {
  postMessage({ kind: 'initialization-failed', message } satisfies WorkerInitializationFailed)
}

async function initialize(message: Record<string, unknown>) {
  if (initializationStarted) {
    return
  }

  // The client retires a failed instance and gives a retry a fresh Worker.
  initializationStarted = true
  if (message.bridgeVersion !== BRIDGE_VERSION || !(message.module instanceof WebAssembly.Module)) {
    reportInitializationFailure('Invalid engine initialization')
    return
  }

  try {
    engine = await createWorkerEngine(message.module)
    postMessage({ kind: 'ready', bridgeVersion: BRIDGE_VERSION } satisfies WorkerReady)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Engine initialization failed'
    reportInitializationFailure(message)
  }
}

function describeGeneration(result: GenerationResult): GenerateOutcome {
  switch (result.status) {
    case 'ready':
      return {
        status: 'completed',
        value: result.puzzle,
        assessment: { status: 'rated', summary: result.assessment },
      }
    case 'incomplete':
      return {
        status: 'incomplete',
        message: 'No qualifying puzzle found within the generation limits',
      }
    case 'failed':
      return { status: 'failed', message: result.reason }
  }
}

function compute(engine: WorkerEngine, request: WorkerRequest): WorkerResponse {
  const { kind, requestId } = request

  switch (kind) {
    case 'generate':
      return {
        kind,
        requestId,
        outcome: describeGeneration(engine.generate(request.input)),
      }
    case 'assess':
      return {
        kind,
        requestId,
        outcome: { status: 'completed', value: engine.assess(request.input) },
      }
    case 'conflicts':
      return {
        kind,
        requestId,
        outcome: { status: 'completed', value: engine.conflicts(request.board, request.rules) },
      }
    case 'generate-notes':
      return {
        kind,
        requestId,
        outcome: { status: 'completed', value: engine.generateNotes(request.input) },
      }
    case 'hint':
      return {
        kind,
        requestId,
        outcome: {
          status: 'completed',
          value: engine.hint(request.board, request.solution, request.rules),
        },
      }
  }
}

function replyToFailure(
  request: unknown,
  outcome: { status: 'failed'; message: string } | { status: 'timed-out' },
) {
  if (!isRecord(request) || typeof request.requestId !== 'string') {
    return
  }

  postMessage({
    kind: request.kind,
    requestId: request.requestId,
    outcome,
  })
}

addEventListener('message', (event: MessageEvent<unknown>) => {
  const message: unknown = event.data
  if (isRecord(message) && message.kind === 'initialize') {
    void initialize(message)
    return
  }

  if (!engine) {
    replyToFailure(message, { status: 'failed', message: 'Worker engine is not ready' })
    return
  }

  try {
    const parsed = parseWorkerRequest(message, engine)
    if (!parsed.valid) {
      replyToFailure(message, { status: 'failed', message: parsed.issues.join('; ') })
      return
    }

    postMessage(compute(engine, parsed.value))
  } catch (error: unknown) {
    const description = error instanceof Error ? error.message : 'Computation failed'
    if (isWasmTimeout(error)) {
      replyToFailure(message, { status: 'timed-out' })
      return
    }

    replyToFailure(message, { status: 'failed', message: description })
  }
})

export {}
