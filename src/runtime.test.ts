import 'fake-indexeddb/auto'
import { afterEach, expect, it, vi } from 'vitest'
import { createGameRuntime } from '@/runtime'
import * as moduleLoader from '@/sudoku/wasmModule'
import * as engineFactory from '@/sudoku/mainEngine'
import * as workerFactory from '@/worker/client'
import { createTestEngine, getTestModule } from '../tests/support/wasm'
import { deferred } from '../tests/support/deferred'
import type { GameRuntime } from '@/runtime'
import { createTestRuntime } from '../tests/support/runtime'
import type { Board } from '@/sudoku/contracts'

const runtimes: GameRuntime[] = []
function runtime() {
  const value = createGameRuntime()
  runtimes.push(value)
  return value
}

afterEach(() => {
  for (const item of runtimes.splice(0)) {
    item.dispose?.()
  }
  vi.restoreAllMocks()
})

it('creates and disposes browsing services without requesting WASM', () => {
  const load = vi.spyOn(moduleLoader, 'loadSudokuModule')
  const value = runtime()

  expect(value.worker).toBeDefined()
  expect(load).not.toHaveBeenCalled()
  value.dispose?.()

  expect(load).not.toHaveBeenCalled()
})

it('shares initialization and retries a failed module download', async () => {
  const pending = deferred<WebAssembly.Module>()
  const load = vi
    .spyOn(moduleLoader, 'loadSudokuModule')
    .mockRejectedValueOnce(new Error('offline'))
    .mockReturnValueOnce(pending.promise)
  const value = runtime()

  await expect(value.ensureEngine()).rejects.toThrow('offline')
  const first = value.ensureEngine()
  const second = value.ensureEngine()
  pending.resolve(getTestModule())
  await Promise.all([first, second])

  expect(load).toHaveBeenCalledTimes(2)
  expect(value.engine.deriveSeed(new Uint8Array())).toHaveLength(32)
})

it('disposes a late initializer without publishing it after shutdown', async () => {
  const engine = await createTestEngine()
  const dispose = vi.spyOn(engine, 'dispose')
  const pending = deferred<typeof engine>()
  vi.spyOn(moduleLoader, 'loadSudokuModule').mockResolvedValue(getTestModule())
  const initialize = vi.spyOn(engineFactory, 'createMainEngine').mockReturnValue(pending.promise)
  const value = runtime()
  const ready = value.ensureEngine()
  const rejected = expect(ready).rejects.toThrow(/disposed/i)
  await vi.waitFor(() => expect(initialize).toHaveBeenCalledOnce())

  value.dispose?.()
  pending.resolve(engine)
  await rejected

  expect(dispose).toHaveBeenCalledOnce()
  expect(() => value.engine).toThrow(/disposed/i)
})

it('cancels a worker request while shared initialization is still pending', async () => {
  const pending = deferred<WebAssembly.Module>()
  vi.spyOn(moduleLoader, 'loadSudokuModule').mockReturnValue(pending.promise)
  const value = runtime()
  const cancellation = new AbortController()
  const request = value.worker.conflicts(
    Array(81).fill(0),
    { kind: 'classic' },
    cancellation.signal,
  )

  cancellation.abort()

  await expect(request).resolves.toEqual({ status: 'cancelled' })
  pending.resolve(getTestModule())
  await value.ensureEngine()
})

it('turns a worker initialization failure into a retryable operation outcome', async () => {
  vi.spyOn(moduleLoader, 'loadSudokuModule').mockRejectedValue(new Error('offline'))
  const value = runtime()

  const result = await value.worker.conflicts(Array(81).fill(0), { kind: 'classic' })

  expect(result).toEqual({ status: 'failed', message: 'offline' })
})

it('keeps the submitted board stable while computation initializes', async () => {
  const testRuntime = await createTestRuntime()
  const conflicts = vi.spyOn(testRuntime.runtime.worker, 'conflicts')
  vi.spyOn(workerFactory, 'createSudokuWorkerClient').mockReturnValue(testRuntime.runtime.worker)
  const pending = deferred<WebAssembly.Module>()
  vi.spyOn(moduleLoader, 'loadSudokuModule').mockReturnValue(pending.promise)
  const value = runtime()
  const board: Board[number][] = Array(81).fill(0)
  const request = value.worker.conflicts(board, { kind: 'classic' })

  board[0] = 1
  board[1] = 1
  pending.resolve(getTestModule())

  try {
    await request

    // The worker must receive the submitted board, not the caller's edits made during startup.
    expect(conflicts).toHaveBeenCalledWith(Array(81).fill(0), { kind: 'classic' }, undefined)
  } finally {
    testRuntime.dispose()
  }
})
