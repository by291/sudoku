import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createSudokuWorkerClient } from '@/worker/client'
import { PUZZLE_VERSION } from '@/core/sudoku/generation'
import { solvedBoard, uniqueBoard } from '../../tests/fixtures/sudoku'
import type { WorkerRequest } from '@/worker/protocol'

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
  puzzleVersion: PUZZLE_VERSION,
} satisfies Parameters<ReturnType<typeof createSudokuWorkerClient>['generate']>[0]
function latestWorker(): FakeWorker {
  const worker = FakeWorker.instances.at(-1)
  if (!worker) throw new Error('No worker was created')
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
  const worker = latestWorker(),
    request = worker.requests[0]
  const outcome = {
    status: 'completed',
    value: { ...input, givens: uniqueBoard, solution: solvedBoard },
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
  const client = createSudokuWorkerClient(),
    controller = new AbortController()
  const pending = client.hint(uniqueBoard, solvedBoard, controller.signal)
  expect(FakeWorker.instances).toHaveLength(1)
  const old = latestWorker()
  controller.abort()
  expect(await pending).toEqual({ status: 'cancelled' })
  expect(old.terminated).toBe(true)
  const next = client.hint(uniqueBoard, solvedBoard)
  old.reply({
    kind: 'hint',
    requestId: old.requests[0].requestId,
    outcome: { status: 'completed', value: { kind: 'review-entry', cell: 2 } },
  })
  expect(latestWorker().terminated).toBe(false)
  client.dispose()
  expect(await next).toEqual({ status: 'cancelled' })
})
