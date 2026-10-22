import { createWorkerEngine } from '@/sudoku/workerEngine'
import { BRIDGE_VERSION } from '@/sudoku/guards'
import { isRecord } from '@/sudoku/values'
import { parseWorkerRequest } from '@/worker/protocol'
import type { WorkerResponse, WorkerReady, WorkerInitializationFailed } from '@/worker/protocol'

let engine: Awaited<ReturnType<typeof createWorkerEngine>> | null = null
let initializing = false

addEventListener('message', (event: MessageEvent<unknown>) => {
  if (isRecord(event.data) && event.data.kind === 'initialize') {
    if (initializing || engine) {
      return
    }
    initializing = true
    if (
      event.data.bridgeVersion !== BRIDGE_VERSION ||
      !(event.data.module instanceof WebAssembly.Module)
    ) {
      postMessage({
        kind: 'initialization-failed',
        message: 'Invalid engine initialization',
      } satisfies WorkerInitializationFailed)
      return
    }
    void createWorkerEngine(event.data.module)
      .then((initialized) => {
        engine = initialized
        postMessage({ kind: 'ready', bridgeVersion: BRIDGE_VERSION } satisfies WorkerReady)
      })
      .catch((error: unknown) => {
        postMessage({
          kind: 'initialization-failed',
          message: error instanceof Error ? error.message : 'Engine initialization failed',
        } satisfies WorkerInitializationFailed)
      })
    return
  }
  if (!engine) {
    if (isRecord(event.data) && typeof event.data.requestId === 'string') {
      postMessage({
        kind: event.data.kind,
        requestId: event.data.requestId,
        outcome: { status: 'failed', message: 'Worker engine is not ready' },
      })
    }
    return
  }

  try {
    const parsed = parseWorkerRequest(event.data, engine)
    if (!parsed.valid) {
      if (isRecord(event.data) && typeof event.data.requestId === 'string') {
        postMessage({
          kind: event.data.kind,
          requestId: event.data.requestId,
          outcome: { status: 'failed', message: parsed.issues.join('; ') },
        })
      }
      return
    }
    const request = parsed.value
    let response: WorkerResponse
    if (request.kind === 'generate') {
      const result = engine.generate(request.input)
      if (result.status === 'ready') {
        response = {
          kind: 'generate',
          requestId: request.requestId,
          outcome: {
            status: 'completed',
            value: result.puzzle,
            assessment: { status: 'rated', summary: result.assessment },
          },
        }
      } else if (result.status === 'incomplete') {
        response = {
          kind: 'generate',
          requestId: request.requestId,
          outcome: {
            status: 'incomplete',
            message: 'No qualifying puzzle found within the generation limits',
          },
        }
      } else {
        response = {
          kind: 'generate',
          requestId: request.requestId,
          outcome: { status: 'failed', message: result.reason },
        }
      }
    } else if (request.kind === 'assess') {
      response = {
        kind: 'assess',
        requestId: request.requestId,
        outcome: { status: 'completed', value: engine.assess(request.input) },
      }
    } else if (request.kind === 'conflicts') {
      response = {
        kind: 'conflicts',
        requestId: request.requestId,
        outcome: { status: 'completed', value: engine.conflicts(request.board, request.rules) },
      }
    } else if (request.kind === 'generate-notes') {
      response = {
        kind: 'generate-notes',
        requestId: request.requestId,
        outcome: { status: 'completed', value: engine.generateNotes(request.input) },
      }
    } else {
      response = {
        kind: 'hint',
        requestId: request.requestId,
        outcome: {
          status: 'completed',
          value: engine.hint(request.board, request.solution, request.rules),
        },
      }
    }
    postMessage(response)
  } catch (error: unknown) {
    if (!isRecord(event.data) || typeof event.data.requestId !== 'string') {
      return
    }
    postMessage({
      kind: event.data.kind,
      requestId: event.data.requestId,
      outcome: {
        ...(error instanceof Error && error.message === 'Computation timed out'
          ? { status: 'timed-out' as const }
          : {
              status: 'failed' as const,
              message: error instanceof Error ? error.message : 'Computation failed',
            }),
      },
    })
  }
})
export {}
