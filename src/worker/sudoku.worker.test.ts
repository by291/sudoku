import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { generationInput } from '../../tests/support/generation'
import { getTestModule } from '../../tests/support/wasm'
import { createWorkerEngine } from '@/sudoku/workerEngine'
import type { GenerationExhaustionDto } from '@sudoku/wasm'
import type { WorkerResponse, WorkerReady } from '@/worker/protocol'

vi.mock('@/sudoku/workerEngine', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/sudoku/workerEngine')>()
  return { ...original, createWorkerEngine: vi.fn(original.createWorkerEngine) }
})

let handler: ((event: MessageEvent<unknown>) => void) | undefined
let engine: Awaited<ReturnType<typeof createWorkerEngine>>
const post = vi.fn<(response: WorkerResponse | WorkerReady) => void>()

beforeAll(async () => {
  const actual = await createWorkerEngine(getTestModule())
  engine = { ...actual, generate: vi.fn(actual.generate) }
  vi.mocked(createWorkerEngine).mockResolvedValue(engine)
  vi.stubGlobal(
    'addEventListener',
    (_kind: string, listener: (event: MessageEvent<unknown>) => void) => {
      handler = listener
    },
  )
  vi.stubGlobal('postMessage', post)
  await import('@/worker/sudoku.worker')
  if (!handler) {
    throw new Error('Worker message handler was not installed')
  }
  handler(
    new MessageEvent('message', {
      data: { kind: 'initialize', bridgeVersion: 4, module: getTestModule() },
    }),
  )
  await vi.waitFor(() => expect(post).toHaveBeenCalledWith({ kind: 'ready', bridgeVersion: 4 }))
  post.mockClear()
})
afterAll(() => vi.unstubAllGlobals())

it.each<GenerationExhaustionDto>([
  'cancelled',
  'logical-step-limit',
  'layout-limit',
  'exhausted-frontier',
])('maps %s to the existing public exhaustion envelope without diagnostics', (cause) => {
  vi.mocked(engine.generate).mockReturnValue({
    status: 'incomplete',
    stage: 'construction',
    cause,
    metrics: {
      layouts: 1,
      completedLayouts: 1,
      candidateVisits: 2,
    },
  })
  if (!handler) {
    throw new Error('Worker message handler was not installed')
  }

  handler(
    new MessageEvent('message', {
      data: {
        kind: 'generate',
        requestId: cause,
        input: generationInput('classic', 'hard', 'adapter-cause'),
      },
    }),
  )

  expect(post.mock.lastCall?.[0]).toEqual({
    kind: 'generate',
    requestId: cause,
    outcome: {
      status: 'incomplete',
      message: 'No qualifying puzzle found within the generation limits',
    },
  })
})
