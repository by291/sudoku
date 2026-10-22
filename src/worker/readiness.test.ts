import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createSudokuWorkerClient } from '@/worker/client'
import { encodeSeed } from '@/sudoku/seed'
import { createTestEngine, getTestModule } from '../../tests/support/wasm'
import { solvedBoard, uniqueBoard } from '../../tests/fixtures/sudoku'
import { isRecord } from '@/sudoku/values'

const engine = await createTestEngine()
afterAll(() => engine.dispose())

class InitializingWorker extends EventTarget {
  static instances: InitializingWorker[] = []
  messages: unknown[] = []
  terminations = 0

  constructor() {
    super()
    InitializingWorker.instances.push(this)
  }
  postMessage(value: unknown) {
    this.messages.push(value)
  }
  terminate() {
    this.terminations++
  }
  reply(value: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data: value }))
  }
}

function input() {
  return {
    variant: 'classic' as const,
    difficulty: 'easy' as const,
    puzzleVersion: 'sudoku-v12' as const,
    seed: new Uint8Array(32),
  }
}

function currentWorker() {
  const worker = InitializingWorker.instances.at(-1)
  if (!worker) {
    throw new Error('Missing test Worker')
  }
  return worker
}

beforeEach(() => {
  InitializingWorker.instances = []
  vi.useFakeTimers()
  vi.stubGlobal('Worker', InitializingWorker)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('idle_worker_computes_no_puzzle', async () => {
  const client = createSudokuWorkerClient(getTestModule(), engine)
  const worker = currentWorker()

  await vi.advanceTimersByTimeAsync(10000)

  expect(worker.messages).toHaveLength(1)
  expect(worker.messages[0]).toMatchObject({ kind: 'initialize', bridgeVersion: 4 })
  expect(worker.terminations).toBe(0)
  client.dispose()
})

it('request_waits_for_ready_without_losing_deadline', async () => {
  const client = createSudokuWorkerClient(getTestModule(), engine)
  const worker = currentWorker()
  const pending = client.generate(input())

  expect(worker.messages).toHaveLength(1)
  await vi.advanceTimersByTimeAsync(2999)
  expect(worker.terminations).toBe(0)
  await vi.advanceTimersByTimeAsync(1)

  expect(await pending).toEqual({ status: 'timed-out' })
  expect(worker.terminations).toBe(1)
  worker.reply({ kind: 'ready', bridgeVersion: 4 })
  await vi.advanceTimersByTimeAsync(0)
  expect(worker.messages).toHaveLength(1)
  client.dispose()
})

it('abort_during_wasm_initialization_settles_once', async () => {
  const client = createSudokuWorkerClient(getTestModule(), engine)
  const worker = currentWorker()
  const controller = new AbortController()
  const pending = client.generate(input(), controller.signal)

  controller.abort()
  worker.reply({ kind: 'initialization-failed', message: 'Late failure' })
  await vi.advanceTimersByTimeAsync(3000)

  expect(await pending).toEqual({ status: 'cancelled' })
  expect(worker.terminations).toBe(1)
  client.dispose()
  expect(worker.terminations).toBe(1)
})

it('worker_seed_identity_uses_owned_byte_contents', async () => {
  const client = createSudokuWorkerClient(getTestModule(), engine)
  const worker = currentWorker()
  const request = input()
  const pending = client.generate(request)
  request.seed.fill(255)
  worker.reply({ kind: 'ready', bridgeVersion: 4 })
  await vi.advanceTimersByTimeAsync(0)
  const posted = worker.messages[1]
  if (!isRecord(posted) || !isRecord(posted.input)) {
    throw new Error('Missing generated request')
  }

  expect(posted.input.seed).toEqual(new Uint8Array(32))
  worker.reply({
    kind: 'generate',
    requestId: posted.requestId,
    outcome: {
      status: 'completed',
      value: {
        givens: uniqueBoard,
        solution: solvedBoard,
        rules: { kind: 'classic' },
        difficulty: 'easy',
        seed: encodeSeed(new Uint8Array(32)),
        puzzleVersion: 'sudoku-v12',
      },
    },
  })

  expect(await pending).toMatchObject({ status: 'completed', value: { seed: '0'.repeat(64) } })
  expect(worker.terminations).toBe(1)
  client.dispose()
})

it('late_reply_cannot_revive_a_terminated_job', async () => {
  const client = createSudokuWorkerClient(getTestModule(), engine)
  const worker = currentWorker()
  const pending = client.generate(input())

  await vi.advanceTimersByTimeAsync(3000)
  worker.reply({ kind: 'ready', bridgeVersion: 4 })
  await vi.advanceTimersByTimeAsync(0)

  expect(await pending).toEqual({ status: 'timed-out' })
  expect(worker.terminations).toBe(1)
  expect(worker.messages).toHaveLength(1)
  client.dispose()
})

it('rejects_a_response_with_one_changed_seed_byte', async () => {
  const client = createSudokuWorkerClient(getTestModule(), engine)
  const worker = currentWorker()
  const pending = client.generate(input())
  worker.reply({ kind: 'ready', bridgeVersion: 4 })
  await vi.advanceTimersByTimeAsync(0)
  const posted = worker.messages[1]
  if (!isRecord(posted)) {
    throw new Error('Missing request')
  }
  const changed = new Uint8Array(32)
  changed[31] = 1

  worker.reply({
    kind: 'generate',
    requestId: posted.requestId,
    outcome: {
      status: 'completed',
      value: {
        givens: uniqueBoard,
        solution: solvedBoard,
        rules: { kind: 'classic' },
        difficulty: 'easy',
        seed: encodeSeed(changed),
        puzzleVersion: 'sudoku-v12',
      },
    },
  })

  expect(await pending).toMatchObject({ status: 'failed' })
  expect(worker.terminations).toBe(1)
  client.dispose()
})

it('initialization_failure_is_retained_and_retry_owns_a_fresh_worker', async () => {
  const client = createSudokuWorkerClient(getTestModule(), engine)
  const first = currentWorker()
  first.reply({ kind: 'initialization-failed', message: 'Invalid WASM module' })

  expect(await client.generate(input())).toEqual({
    status: 'failed',
    message: 'Invalid WASM module',
  })
  const retry = client.generate(input())
  expect(currentWorker()).not.toBe(first)
  client.dispose()

  expect(await retry).toEqual({ status: 'cancelled' })
  expect(first.terminations).toBe(1)
})

it('rejects the immediately previous Worker bridge before dispatching a job', async () => {
  const client = createSudokuWorkerClient(getTestModule(), engine)
  const worker = currentWorker()
  const pending = client.generate(input())

  worker.reply({ kind: 'ready', bridgeVersion: 2 })

  expect(await pending).toEqual({ status: 'failed', message: 'Worker engine bridge mismatch' })
  expect(worker.messages).toHaveLength(1)
  expect(worker.terminations).toBe(1)
  client.dispose()
})
