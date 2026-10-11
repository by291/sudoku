import { generatePuzzle } from '../../core/sudoku/generation'
import { analyzeHint } from '../../core/sudoku/hint'
import { isRecord } from '../../core/sudoku/types'
import { parseWorkerRequest } from './protocol'
import type { WorkerResponse } from './protocol'

addEventListener('message', (event: MessageEvent<unknown>) => {
  const parsed = parseWorkerRequest(event.data)
  if (!parsed.valid) {
    if (isRecord(event.data) && typeof event.data.requestId === 'string')
      postMessage({
        kind: event.data.kind,
        requestId: event.data.requestId,
        outcome: { status: 'failed', message: parsed.issues.join('; ') },
      })
    return
  }
  const request = parsed.value
  try {
    let response: WorkerResponse
    if (request.kind === 'generate') {
      const result = generatePuzzle(request.input)
      response = {
        kind: 'generate',
        requestId: request.requestId,
        outcome:
          result.status === 'ready'
            ? { status: 'completed', value: result.puzzle }
            : result.status === 'budget-exhausted'
              ? { status: 'budget-exhausted', message: 'Fallback verification budget exhausted' }
              : { status: 'failed', message: result.reason },
      }
    } else
      response = {
        kind: 'hint',
        requestId: request.requestId,
        outcome: { status: 'completed', value: analyzeHint(request.board, request.solution, 500) },
      }
    postMessage(response)
  } catch (error) {
    postMessage({
      kind: request.kind,
      requestId: request.requestId,
      outcome: {
        status: 'failed',
        message: error instanceof Error ? error.message : 'Computation failed',
      },
    })
  }
})
