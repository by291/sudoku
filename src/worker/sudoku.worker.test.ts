import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { createGenerationInput } from '@/core/sudoku/generation/input'
import { generatePuzzle } from '@/core/sudoku/generation/generate'
import type { GenerationExhaustionCause } from '@/core/sudoku/generation/types'
import type { WorkerResponse } from '@/worker/protocol'

vi.mock('@/core/sudoku/generation/generate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/sudoku/generation/generate')>()),
  generatePuzzle: vi.fn(),
}))

let handler: ((event: MessageEvent<unknown>) => void) | undefined
const post = vi.fn<(response: WorkerResponse) => void>()

beforeAll(async () => {
  vi.stubGlobal(
    'addEventListener',
    (_kind: string, listener: (event: MessageEvent<unknown>) => void) => {
      handler = listener
    },
  )
  vi.stubGlobal('postMessage', post)
  await import('@/worker/sudoku.worker')
})

afterAll(() => vi.unstubAllGlobals())

it.each<GenerationExhaustionCause>([
  'work-limit',
  'logical-step-limit',
  'layout-limit',
  'exhausted-frontier',
])('maps %s to the existing public exhaustion envelope without diagnostics', (cause) => {
  vi.mocked(generatePuzzle).mockReturnValue({
    status: 'budget-exhausted',
    stage: 'construction',
    cause,
    metrics: {
      constructionWork: 17,
      layouts: 1,
      completedLayouts: 1,
      candidateVisits: 2,
      workByStage: { preparation: 3, arithmetic: 2, exact: 4, logic: 5, proposals: 3 },
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
        input: createGenerationInput('classic', 'hard', 'adapter-cause'),
      },
    }),
  )

  expect(post.mock.lastCall?.[0]).toEqual({
    kind: 'generate',
    requestId: cause,
    outcome: {
      status: 'budget-exhausted',
      message: 'No qualifying puzzle found within the generation limits',
    },
  })
})
