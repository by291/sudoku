import { createTestEngine, getTestModule } from '../../tests/support/wasm'
import { seedForTest } from '../../tests/support/generation'
import { encodeSeed } from '@/sudoku/seed'
import type { WorkerInbound } from '@/worker/protocol'
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createSudokuWorkerClient } from '@/worker/client'
import { generationInput } from '../../tests/support/generation'
import { PUZZLE_VERSION } from '@/sudoku/guards'
import { VARIANT_FIXTURES } from '../../tests/fixtures/variants'
import { solvedBoard, uniqueBoard } from '../../tests/fixtures/sudoku'
import type { WorkerRequest } from '@/worker/protocol'
import { createAssessmentInput } from '../../tests/support/assessment'

const engine = await createTestEngine()
afterAll(() => engine.dispose())

class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = []
  static autoReady = true
  requests: WorkerRequest[] = []
  terminated = false
  constructor() {
    super()
    FakeWorker.instances.push(this)
  }
  postMessage(request: WorkerInbound) {
    if (request.kind === 'initialize') {
      if (FakeWorker.autoReady) {
        this.reply({ kind: 'ready', bridgeVersion: request.bridgeVersion })
      }
    } else {
      this.requests.push(request)
    }
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
  seed: seedForTest('worker'),
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
  FakeWorker.autoReady = true
  vi.useFakeTimers()
  vi.stubGlobal('Worker', FakeWorker)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('prepares one idle worker without starting the request timeout or computing a puzzle', async () => {
  const client = createSudokuWorkerClient(getTestModule(), engine)

  expect(FakeWorker.instances).toHaveLength(1)
  const prepared = latestWorker()
  await vi.advanceTimersByTimeAsync(5000)

  expect(prepared.requests).toEqual([])
  expect(prepared.terminated).toBe(false)
  const pending = client.generate(input)

  expect(FakeWorker.instances).toHaveLength(1)
  expect(prepared.requests[0]).toMatchObject({ kind: 'generate', input })
  await vi.advanceTimersByTimeAsync(3000)

  expect(await pending).toEqual({ status: 'timed-out' })
  expect(prepared.terminated).toBe(true)
  expect(FakeWorker.instances).toHaveLength(2)
  expect(latestWorker().requests).toEqual([])
  client.dispose()

  expect(FakeWorker.instances.every((worker) => worker.terminated)).toBe(true)
})

it('reports an idle worker startup failure and prepares a fresh worker for retry', async () => {
  const client = createSudokuWorkerClient(getTestModule(), engine)
  const prepared = latestWorker()
  prepared.dispatchEvent(new ErrorEvent('error', { message: 'Worker script unavailable' }))

  expect(prepared.terminated).toBe(true)
  expect(await client.generate(input)).toEqual({
    status: 'failed',
    message: 'Worker script unavailable',
  })
  const retry = client.generate(input)

  expect(latestWorker().requests[0]).toMatchObject({ kind: 'generate', input })
  client.dispose()

  expect(await retry).toEqual({ status: 'cancelled' })
  expect(FakeWorker.instances.every((worker) => worker.terminated)).toBe(true)
})

it('assesses with the same timeout, stale reply fence, cancellation, and disposal', async () => {
  const client = createSudokuWorkerClient(getTestModule(), engine)
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
  await vi.advanceTimersByTimeAsync(2999)

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
  const client = createSudokuWorkerClient(getTestModule(), engine)
  const pending = client.assess(createAssessmentInput(uniqueBoard, { kind: 'classic' }))
  const worker = latestWorker()
  worker.reply({
    kind: 'assess',
    requestId: worker.requests[0].requestId,
    outcome: {
      status: 'completed',
      value: { status: 'ungraded', variant: 'arrow', ratingVersion: 'sudoku-rating-v2' },
    },
  })

  expect(await pending).toMatchObject({ status: 'failed' })
  expect(worker.terminated).toBe(true)
  client.dispose()
})
it('terminates generation after three seconds without changing retry input', async () => {
  const client = createSudokuWorkerClient(getTestModule(), engine)
  const pending = client.generate(input)

  expect(FakeWorker.instances).toHaveLength(1)
  const first = latestWorker()
  await vi.advanceTimersByTimeAsync(2999)

  expect(first.terminated).toBe(false)
  await vi.advanceTimersByTimeAsync(1)

  expect(first.terminated).toBe(true)
  expect(await pending).toEqual({ status: 'timed-out' })
  const retry = client.generate(input)

  expect(latestWorker().requests[0]).toMatchObject({ kind: 'generate', input })
  client.dispose()

  expect(await retry).toEqual({ status: 'cancelled' })
})
it('ignores unknown IDs and validates success before settling once', async () => {
  const client = createSudokuWorkerClient(getTestModule(), engine)
  const pending = client.generate(input)

  expect(FakeWorker.instances).toHaveLength(1)
  const worker = latestWorker()
  const request = worker.requests[0]
  const outcome = {
    status: 'completed',
    value: {
      seed: encodeSeed(input.seed),
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
  const client = createSudokuWorkerClient(getTestModule(), engine)
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
  const client = createSudokuWorkerClient(getTestModule(), engine)
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
  const client = createSudokuWorkerClient(getTestModule(), engine)
  const variantInput = generationInput('arrow', 'medium', 'variant-worker')
  const pending = client.generate(variantInput)
  await vi.advanceTimersByTimeAsync(3000)

  expect(await pending).toEqual({ status: 'timed-out' })
  const controller = new AbortController()
  const fixture = VARIANT_FIXTURES.arrow
  const hint = client.hint(fixture.givens, fixture.solution, fixture.rules, controller.signal)
  const hintWorker = latestWorker()

  expect(hintWorker.requests[0]).toMatchObject({ rules: fixture.rules })
  controller.abort()

  expect(await hint).toEqual({ status: 'cancelled' })
  expect(hintWorker.terminated).toBe(true)
  client.dispose()
})

it('ignores stale variant replies and preserves incomplete results', async () => {
  const client = createSudokuWorkerClient(getTestModule(), engine)
  const pending = client.generate(generationInput('thermo', 'hard', 'variant-worker'))
  const worker = latestWorker()
  const outcome = { status: 'incomplete', message: 'Bounded work exhausted' }
  worker.reply({ kind: 'generate', requestId: 'stale-variant', outcome })

  expect(worker.terminated).toBe(false)
  worker.reply({ kind: 'generate', requestId: worker.requests[0].requestId, outcome })

  expect(await pending).toEqual(outcome)
  client.dispose()
})

it('rejects a valid puzzle whose type does not match the variant request', async () => {
  const client = createSudokuWorkerClient(getTestModule(), engine)
  const variantInput = generationInput('arrow', 'easy', 'variant-worker')
  const pending = client.generate(variantInput)
  const worker = latestWorker()
  worker.reply({
    kind: 'generate',
    requestId: worker.requests[0].requestId,
    outcome: {
      status: 'completed',
      value: {
        ...variantInput,
        seed: encodeSeed(variantInput.seed),
        givens: uniqueBoard,
        solution: solvedBoard,
        rules: { kind: 'classic' },
      },
    },
  })

  expect(await pending).toMatchObject({ status: 'failed' })
  client.dispose()
})

it('live_jobs_preserve_owned_snapshots_partial_results_and_original_deadlines', async () => {
  const client = createSudokuWorkerClient(getTestModule(), engine)
  const board = [...uniqueBoard]
  const pending = client.conflicts(board, { kind: 'classic' })
  const worker = latestWorker()
  const request = worker.requests[0]
  board.fill(0)

  expect(request).toMatchObject({ kind: 'conflicts', board: uniqueBoard })
  const computation = { result: { status: 'incomplete', violations: [] } }
  worker.reply({
    kind: 'conflicts',
    requestId: request.requestId,
    outcome: { status: 'completed', value: { computation } },
  })

  expect(await pending).toEqual({
    status: 'completed',
    value: { computation },
  })
  const notes = Array<number>(81).fill(0)
  const editing = client.generateNotes({
    givens: uniqueBoard,
    entries: Array(81).fill(0),
    notes,
    rules: { kind: 'classic' },
  })
  const editingWorker = latestWorker()
  notes[0] = 511

  expect(editingWorker.requests[0]).toMatchObject({
    kind: 'generate-notes',
    input: { notes: Array(81).fill(0) },
  })
  await vi.advanceTimersByTimeAsync(3000)
  expect(await editing).toEqual({ status: 'timed-out' })
  expect(editingWorker.terminated).toBe(true)
  client.dispose()
})

it('live_jobs_reject_malformed_results_and_terminate_cancelled_or_disposed_owners', async () => {
  const client = createSudokuWorkerClient(getTestModule(), engine)
  const pending = client.conflicts(uniqueBoard, { kind: 'classic' })
  const worker = latestWorker()
  worker.reply({
    kind: 'conflicts',
    requestId: worker.requests[0].requestId,
    outcome: { status: 'completed', value: { computation: {} } },
  })
  expect((await pending).status).toBe('failed')

  const controller = new AbortController()
  const cancelled = client.generateNotes(
    {
      givens: uniqueBoard,
      entries: Array(81).fill(0),
      notes: Array(81).fill(0),
      rules: { kind: 'classic' },
    },
    controller.signal,
  )
  const owner = latestWorker()
  controller.abort()
  expect(await cancelled).toEqual({ status: 'cancelled' })
  expect(owner.terminated).toBe(true)
  const disposed = client.conflicts(uniqueBoard, { kind: 'classic' })
  client.dispose()
  expect(await disposed).toEqual({ status: 'cancelled' })
})

it('live_jobs_snapshot_before_delayed_readiness_and_keep_the_initial_deadline', async () => {
  FakeWorker.autoReady = false
  const client = createSudokuWorkerClient(getTestModule(), engine)
  const notes = Array<number>(81).fill(0)
  const pending = client.generateNotes({
    givens: uniqueBoard,
    entries: Array(81).fill(0),
    notes,
    rules: { kind: 'classic' },
  })
  const worker = latestWorker()
  notes.fill(511)
  await vi.advanceTimersByTimeAsync(2000)
  expect(worker.requests).toEqual([])
  worker.reply({ kind: 'ready', bridgeVersion: 4 })
  await Promise.resolve()
  expect(worker.requests[0]).toMatchObject({ input: { notes: Array(81).fill(0) } })
  await vi.advanceTimersByTimeAsync(1000)
  expect(await pending).toEqual({ status: 'timed-out' })
  client.dispose()
})

it('stops every analysis request at the shared three-second deadline', async () => {
  const client = createSudokuWorkerClient(getTestModule(), engine)
  let settled = false
  const pending = client.assess(createAssessmentInput(uniqueBoard, { kind: 'classic' }))
  void pending.then(() => {
    settled = true
  })
  const worker = latestWorker()

  await vi.advanceTimersByTimeAsync(2999)
  expect(settled).toBe(false)
  await vi.advanceTimersByTimeAsync(1)

  expect(settled).toBe(true)
  expect(await pending).toEqual({ status: 'timed-out' })
  expect(worker.terminated).toBe(true)
  client.dispose()
})

it('rejects a late reply even when the timeout callback has not run', async () => {
  const clock = vi.spyOn(performance, 'now').mockReturnValue(0)
  const client = createSudokuWorkerClient(getTestModule(), engine)
  const pending = client.assess(createAssessmentInput(uniqueBoard, { kind: 'classic' }))
  const worker = latestWorker()

  clock.mockReturnValue(3001)
  worker.reply({
    kind: 'assess',
    requestId: worker.requests[0].requestId,
    outcome: {
      status: 'completed',
      value: { status: 'ungraded', ratingVersion: 'sudoku-rating-v2', variant: 'classic' },
    },
  })

  expect(await pending).toEqual({ status: 'timed-out' })
  expect(worker.terminated).toBe(true)
  client.dispose()
  clock.mockRestore()
})
