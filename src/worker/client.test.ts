import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createSudokuWorkerClient } from '@/worker/client'
import { createGenerationInput, PUZZLE_VERSION } from '@/core/sudoku/generation'
import { VARIANT_FIXTURES } from '../../tests/fixtures/variants'
import { solvedBoard, uniqueBoard } from '../../tests/fixtures/sudoku'
import type { WorkerRequest } from '@/worker/protocol'
import { createAssessmentInput } from '@/core/sudoku/rating'

class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = []
  requests: WorkerRequest[] = []
  terminated = false
  constructor() {
    super()
    FakeWorker.instances.push(this)
  }
  postMessage(request: WorkerRequest) {
    this.requests.push(request)
  }
  terminate() {
    this.terminated = true
  }
  reply(data: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data }))
  }
}
const input = {
  difficulty: 'easy',
  seed: 'worker',
  variant: 'classic' as const,
  puzzleVersion: PUZZLE_VERSION,
} satisfies Parameters<ReturnType<typeof createSudokuWorkerClient>['generate']>[0]

function latestWorker(): FakeWorker {
  const worker = FakeWorker.instances.at(-1)
  if (!worker) {
    throw new Error('No worker was created')
  }

  return worker
}

beforeEach(() => {
  FakeWorker.instances = []
  vi.useFakeTimers()
  vi.stubGlobal('Worker', FakeWorker)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('assesses with the same timeout, stale reply fence, cancellation, and disposal', async () => {
  const client = createSudokuWorkerClient()
  const assessmentInput = createAssessmentInput(uniqueBoard, { kind: 'classic' })
  const pending = client.assess(assessmentInput)
  const worker = latestWorker()
  const reply = {
    kind: 'assess',
    requestId: worker.requests[0].requestId,
    outcome: {
      status: 'completed',
      value: {
        status: 'ungraded',
        ratingVersion: assessmentInput.ratingVersion,
        variant: 'classic',
      },
    },
  }
  worker.reply({ ...reply, requestId: 'stale' })

  expect(worker.terminated).toBe(false)
  worker.reply(reply)

  expect(await pending).toEqual(reply.outcome)
  expect(worker.terminated).toBe(true)
  const timed = client.assess(assessmentInput)
  await vi.advanceTimersByTimeAsync(14999)

  expect(latestWorker().terminated).toBe(false)
  await vi.advanceTimersByTimeAsync(1)

  expect(await timed).toEqual({ status: 'timed-out' })
  const controller = new AbortController()
  const cancelled = client.assess(assessmentInput, controller.signal)
  controller.abort()

  expect(await cancelled).toEqual({ status: 'cancelled' })
  const disposed = client.assess(assessmentInput)
  client.dispose()

  expect(await disposed).toEqual({ status: 'cancelled' })
  expect(await client.assess(assessmentInput)).toEqual({ status: 'cancelled' })
})

it('rejects assessment identities that differ from the submitted rules', async () => {
  const client = createSudokuWorkerClient()
  const pending = client.assess(createAssessmentInput(uniqueBoard, { kind: 'classic' }))
  const worker = latestWorker()
  worker.reply({
    kind: 'assess',
    requestId: worker.requests[0].requestId,
    outcome: {
      status: 'completed',
      value: { status: 'ungraded', variant: 'arrow', ratingVersion: 'sudoku-rating-v1' },
    },
  })

  expect(await pending).toMatchObject({ status: 'failed' })
  expect(worker.terminated).toBe(true)
  client.dispose()
})
it('terminates work after the exact timeout without changing retry input', async () => {
  const client = createSudokuWorkerClient()
  const pending = client.generate(input)

  expect(FakeWorker.instances).toHaveLength(1)
  const first = latestWorker()
  await vi.advanceTimersByTimeAsync(14999)

  expect(first.terminated).toBe(false)
  await vi.advanceTimersByTimeAsync(1)

  expect(await pending).toEqual({ status: 'timed-out' })
  expect(first.terminated).toBe(true)
  const retry = client.generate(input)

  expect(latestWorker().requests[0]).toMatchObject({ kind: 'generate', input })
  client.dispose()

  expect(await retry).toEqual({ status: 'cancelled' })
})
it('ignores unknown IDs and validates success before settling once', async () => {
  const client = createSudokuWorkerClient()
  const pending = client.generate(input)

  expect(FakeWorker.instances).toHaveLength(1)
  const worker = latestWorker()
  const request = worker.requests[0]
  const outcome = {
    status: 'completed',
    value: {
      seed: input.seed,
      difficulty: input.difficulty,
      puzzleVersion: input.puzzleVersion,
      rules: { kind: 'classic' },
      givens: uniqueBoard,
      solution: solvedBoard,
    },
  }
  worker.reply({ kind: 'generate', requestId: 'stale', outcome })

  expect(worker.terminated).toBe(false)
  worker.reply({ kind: 'generate', requestId: request.requestId, outcome })

  expect(await pending).toEqual(outcome)
  expect(worker.terminated).toBe(true)
})
it('rejects malformed replies rather than accepting success-shaped data', async () => {
  const client = createSudokuWorkerClient()
  const pending = client.generate(input)

  expect(FakeWorker.instances).toHaveLength(1)
  const worker = latestWorker()
  worker.reply({
    kind: 'generate',
    requestId: worker.requests[0].requestId,
    outcome: { status: 'completed', value: {} },
  })

  expect(await pending).toMatchObject({ status: 'failed' })
})
it('cancels jobs and cannot deliver an old reply to a new job', async () => {
  const client = createSudokuWorkerClient()
  const controller = new AbortController()
  const pending = client.hint(uniqueBoard, solvedBoard, { kind: 'classic' }, controller.signal)

  expect(FakeWorker.instances).toHaveLength(1)
  const old = latestWorker()
  controller.abort()

  expect(await pending).toEqual({ status: 'cancelled' })
  expect(old.terminated).toBe(true)
  const next = client.hint(uniqueBoard, solvedBoard, { kind: 'classic' })
  old.reply({
    kind: 'hint',
    requestId: old.requests[0].requestId,
    outcome: { status: 'completed', value: { kind: 'review-entry', cell: 2 } },
  })

  expect(latestWorker().terminated).toBe(false)
  client.dispose()

  expect(await next).toEqual({ status: 'cancelled' })
})

it('retains cancellation and timeout outcomes for variants', async () => {
  const client = createSudokuWorkerClient()
  const variantInput = createGenerationInput('arrow', 'medium', 'variant-worker')
  const pending = client.generate(variantInput)
  await vi.advanceTimersByTimeAsync(15000)

  expect(await pending).toEqual({ status: 'timed-out' })
  const controller = new AbortController()
  const fixture = VARIANT_FIXTURES.arrow
  const hint = client.hint(fixture.givens, fixture.solution, fixture.rules, controller.signal)

  expect(latestWorker().requests[0]).toMatchObject({ rules: fixture.rules })
  controller.abort()

  expect(await hint).toEqual({ status: 'cancelled' })
  expect(latestWorker().terminated).toBe(true)
  client.dispose()
})

it('ignores stale variant replies and preserves budget exhaustion', async () => {
  const client = createSudokuWorkerClient()
  const pending = client.generate(createGenerationInput('thermo', 'hard', 'variant-worker'))
  const worker = latestWorker()
  const outcome = { status: 'budget-exhausted', message: 'Bounded work exhausted' }
  worker.reply({ kind: 'generate', requestId: 'stale-variant', outcome })

  expect(worker.terminated).toBe(false)
  worker.reply({ kind: 'generate', requestId: worker.requests[0].requestId, outcome })

  expect(await pending).toEqual(outcome)
  client.dispose()
})

it('rejects a valid puzzle whose type does not match the variant request', async () => {
  const client = createSudokuWorkerClient()
  const variantInput = createGenerationInput('arrow', 'easy', 'variant-worker')
  const pending = client.generate(variantInput)
  const worker = latestWorker()
  worker.reply({
    kind: 'generate',
    requestId: worker.requests[0].requestId,
    outcome: {
      status: 'completed',
      value: {
        ...variantInput,
        givens: uniqueBoard,
        solution: solvedBoard,
        rules: { kind: 'classic' },
      },
    },
  })

  expect(await pending).toMatchObject({ status: 'failed' })
  client.dispose()
})
