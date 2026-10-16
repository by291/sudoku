import { createTestEngine } from '../../../../tests/support/wasm'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { afterAll, expect, it, vi } from 'vitest'
import { gameRuntimeKey } from '@/runtime'
import type { GameRuntime } from '@/runtime'
import { useGameStore } from '@/features/game/stores/useGameStore'
import { makeSession } from '../../../../tests/support/gameFixtures'
import type { HintResult } from '@reference/core/sudoku/hint'
import { createTestRuntime } from '../../../../tests/support/runtime'
import { generationInput } from '../../../../tests/support/generation'

const engine = await createTestEngine()
afterAll(() => engine.dispose())

function setup() {
  let time = 0
  let saved = makeSession()
  let reply: (value: { status: 'completed'; value: HintResult }) => void = () => {
    throw new Error('No hint job')
  }
  const token = { sessionId: saved.id, ownerId: 'test', fence: 1, epoch: 1 }
  const runtime: GameRuntime = {
    ready: true,
    engine,
    createSeed: () => crypto.getRandomValues(new Uint8Array(32)),
    ownerId: 'test',
    monotonicNow: () => time,
    wallNow: () => new Date('2026-10-11T01:00:00.000Z'),
    createId: () => 'new-game',
    worker: {
      conflicts: async () => ({ status: 'failed', message: 'No live conflict fixture' }),
      generateNotes: async () => ({ status: 'failed', message: 'No live notes fixture' }),
      generate: async () => ({ status: 'failed', message: 'Test generation failure' }),
      assess: async () => ({ status: 'failed', message: 'Test assessment failure' }),
      hint: () =>
        new Promise((resolve) => {
          reply = resolve
        }),
      dispose() {},
    },
    ownership: {
      acquireOwnership: async () => ({ ok: true, value: token }),
      renewOwnership: async () => ({ ok: true, value: true }),
      releaseOwnership: async () => ({ ok: true, value: undefined }),
      subscribe: () => () => {},
      notifyReset() {},
      dispose() {},
    },
    repository: {
      exportBackup: async () => ({
        ok: false,
        error: { kind: 'unavailable', message: 'No backup fixture configured' },
      }),
      restoreBackup: async () => ({
        ok: false,
        error: { kind: 'unavailable', message: 'No backup fixture configured' },
      }),
      listSessions: async () => ({
        ok: true,
        value: [{ formatVersion: 2, revision: 1, session: saved }],
      }),
      listResults: async () => ({ ok: true, value: [] }),
      readLessonProgress: async () => ({ ok: true, value: [] }),
      readDatasetEpoch: async () => ({ ok: true, value: 1 }),
      readSettings: async () => ({
        ok: true,
        value: {
          theme: 'system',
          showTimer: true,
          highlightConflicts: true,
          currentLessonId: null,
        },
      }),
      writeSession: async () => ({ ok: false, error: { kind: 'write-failed', message: 'Unused' } }),
      replaceActiveSession: async () => ({
        ok: false,
        error: { kind: 'write-failed', message: 'Unused' },
      }),
      writeSettings: async () => ({ ok: true, value: undefined }),
      writeLessonProgress: async () => ({ ok: true, value: undefined }),
      clearAll: async () => ({ ok: true, value: undefined }),
      removeQuarantined: async () => ({ ok: true, value: undefined }),
      countQuarantined: async () => ({ ok: true, value: 0 }),
    },
    createSaveQueue: () => ({
      revision: 1,
      async enqueue(session) {
        saved = session

        return { ok: true, value: { formatVersion: 2, revision: 2, session } }
      },
      async flush() {
        return { ok: true, value: undefined }
      },
      async retry() {
        return { ok: true, value: undefined }
      },
      dispose() {},
    }),
  }
  const app = createApp({})
  const pinia = createPinia()
  app.use(pinia).provide(gameRuntimeKey, runtime)
  const store = app.runWithContext(() => useGameStore(pinia))

  return {
    store,
    advance: (milliseconds: number) => {
      time += milliseconds
    },
    saved: () => saved,
    reply: (hint: HintResult) => reply({ status: 'completed', value: hint }),
  }
}

it('restores paused, records elapsed time, and refuses edits while paused', async () => {
  const test = setup()
  await test.store.restoreSession('fixture-free-session')

  expect(test.store.phase).toBe('paused')
  test.store.dispatch({ kind: 'enter', cell: 2, digit: 4 })

  expect(test.store.board[2]).toBe(0)
  await test.store.resume()
  test.advance(5000)
  await test.store.periodicSave()

  expect(test.saved().elapsedMs).toBe(5000)
  test.store.pause()
  test.advance(5000)

  expect(test.store.elapsedMs).toBe(5000)
  test.store.dispose()
})
it('ignores stale hints and preserves an old session when generation fails', async () => {
  const test = setup()
  await test.store.restoreSession('fixture-free-session')
  await test.store.resume()
  const hint = test.store.requestHint()
  test.store.dispatch({ kind: 'enter', cell: 2, digit: 4 })
  test.reply({ kind: 'review-entry', cell: 3 })
  await hint

  expect(test.store.hint).toBeNull()
  expect(test.store.session?.assistance.hintCount).toBe(0)
  await test.store.startGame(generationInput('classic', 'easy', 'new'), { kind: 'free' })

  expect(test.store.session?.id).toBe('fixture-free-session')
  expect(test.store.board[2]).toBe(4)
  expect(test.store.error).toContain('失败')
  test.store.dispose()
})
it('counts a shown hint once and applies it through the ordinary undoable action', async () => {
  const test = setup()
  await test.store.restoreSession('fixture-free-session')
  await test.store.resume()
  const job = test.store.requestHint()
  test.reply({
    kind: 'deduction',
    steps: [
      {
        kind: 'placement',
        technique: 'naked-single',
        cell: 2,
        digit: 4,
        evidence: {
          kind: 'unit',
          premises: [],
          unit: { kind: 'row', index: 0 },
          cells: [2],
          digits: [4],
        },
      },
    ],
    placement: { cell: 2, digit: 4 },
  })
  await job

  expect(test.store.session?.assistance.hintCount).toBe(1)
  test.store.applyHint()

  expect(test.store.board[2]).toBe(4)
  test.store.dispatch({ kind: 'undo' })

  expect(test.store.board[2]).toBe(0)
  expect(test.store.session?.assistance.hintCount).toBe(1)
  test.store.dispose()
})
it('invalidates check feedback after the checked board changes', async () => {
  const test = setup()
  await test.store.restoreSession('fixture-free-session')
  await test.store.resume()
  test.store.dispatch({ kind: 'check' })

  expect(test.store.checkIsCurrent).toBe(true)
  test.store.dispatch({ kind: 'enter', cell: 2, digit: 1 })

  expect(test.store.checkIsCurrent).toBe(false)
  expect(test.store.session?.assistance.checkCount).toBe(1)
  test.store.dispose()
})
it('retries a failed generation with the identical seed and metadata', async () => {
  const test = await createTestRuntime()
  const calls: unknown[] = []
  test.runtime.worker.generate = async (input) => {
    calls.push(input)

    return { status: 'timed-out' }
  }
  const game = test.app.runWithContext(() => useGameStore(test.pinia))
  const input = generationInput('classic', 'easy', 'same-request')
  await game.startGame(input, { kind: 'free' })

  expect(game.canRetryGeneration).toBe(true)
  await game.retryGeneration()

  expect(calls).toEqual([input, input])
  game.dispose()
  test.dispose()
})

it('reports deterministic generation exhaustion while keeping the old save and requiring a new request', async () => {
  const test = await createTestRuntime()
  const original = makeSession()
  await test.database.put('sessions', { formatVersion: 2, revision: 1, session: original })
  test.runtime.worker.generate = async () => ({
    status: 'budget-exhausted',
    message: 'No qualifying puzzle found within the generation limits',
  })
  const game = test.app.runWithContext(() => useGameStore(test.pinia))
  await game.restoreSession(original.id)

  const outcome = await game.startGame(generationInput('classic', 'hard', 'exhausted'), {
    kind: 'free',
  })

  expect(outcome).toEqual({ status: 'blocked', reason: 'generation' })
  expect(game.error).toBe('未能生成符合要求的题目，请重新选择。')
  expect(game.canRetryGeneration).toBe(false)
  expect(game.session?.id).toBe(original.id)
  expect(game.session?.puzzle).toEqual(original.puzzle)
  expect(await test.database.get('sessions', original.id)).toMatchObject({
    session: { puzzle: original.puzzle },
  })
  expect(await test.database.count('sessions')).toBe(1)
  game.dispose()
  test.dispose()
})

it('reuses one prepared layout through moves and releases it when the session is dropped', async () => {
  const prepare = vi.spyOn(engine, 'prepare')
  const test = setup()
  await test.store.restoreSession('fixture-free-session')
  const layout = prepare.mock.results[0]?.value
  if (!layout) {
    throw new Error('Missing prepared layout')
  }
  const dispose = vi.spyOn(layout, 'dispose')
  await test.store.resume()

  test.store.dispatch({ kind: 'enter', cell: 2, digit: 4 })
  test.store.dispatch({ kind: 'undo' })
  test.store.dispatch({ kind: 'redo' })
  expect(prepare).toHaveBeenCalledOnce()
  expect(test.store.ruleMetadata?.units).toHaveLength(27)
  expect(dispose).not.toHaveBeenCalled()

  test.store.dropSession()
  test.store.dispose()
  test.store.dispose()

  expect(dispose).toHaveBeenCalledOnce()
  expect(test.store.ruleMetadata).toBeNull()
})
