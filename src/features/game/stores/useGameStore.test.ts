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

function setup(heavy = false) {
  let time = 0
  let saved = makeSession()
  if (heavy) {
    saved = {
      ...saved,
      puzzle: {
        ...saved.puzzle,
        givens: Array(81).fill(0),
        rules: {
          kind: 'killer',
          cages: Array.from({ length: 9 }, (_, row) => ({
            cells: Array.from({ length: 9 }, (_, column) => row * 9 + column),
            sum: 45,
          })),
        },
      },
    }
  }
  let reply: (value: { status: 'completed'; value: HintResult }) => void = () => {
    throw new Error('No hint job')
  }
  const token = { sessionId: saved.id, ownerId: 'test', fence: 1, epoch: 1 }
  const runtime: GameRuntime = {
    ready: true,
    ensureEngine: async () => {},
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
      readSession: async (id) => ({
        ok: true,
        value: id === saved.id ? { formatVersion: 2, revision: 1, session: saved } : null,
      }),
      readResult: async () => ({ ok: true, value: null }),
      readSlot: async (mode, variant) => ({
        ok: true,
        value:
          saved.mode === mode && (mode !== 'free' || saved.puzzle.rules.kind === variant)
            ? { formatVersion: 2, revision: 1, session: saved }
            : null,
      }),
      readSlotSummary: async () => ({
        ok: false,
        error: { kind: 'unavailable', message: 'Unused summary fixture' },
      }),
      readHome: async () => ({
        ok: false,
        error: { kind: 'unavailable', message: 'Unused summary fixture' },
      }),
      readDailyStatuses: async () => ({
        ok: false,
        error: { kind: 'unavailable', message: 'Unused summary fixture' },
      }),
      readSummaryPage: async () => ({
        ok: false,
        error: { kind: 'unavailable', message: 'Unused summary fixture' },
      }),
      readOverview: async () => ({
        ok: false,
        error: { kind: 'unavailable', message: 'Unused summary fixture' },
      }),
      maintainSummaries: async () => ({
        ok: false,
        error: { kind: 'unavailable', message: 'Unused summary fixture' },
      }),
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
    runtime,
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

it('heavy_conflicts_use_preview_and_reject_results_after_a_new_board', async () => {
  const test = setup(true)
  const replies: Array<(value: Awaited<ReturnType<GameRuntime['worker']['conflicts']>>) => void> =
    []
  const signals: Array<AbortSignal | undefined> = []
  test.runtime.worker.conflicts = vi.fn<GameRuntime['worker']['conflicts']>(
    (_board, _rules, signal) => {
      signals.push(signal)
      return new Promise((resolve) => replies.push(resolve))
    },
  )
  await test.store.restoreSession('fixture-free-session')
  await test.store.resume()

  expect(test.store.conflictAnalysisState).toBe('pending')
  test.store.dispatch({ kind: 'enter', cell: 0, digit: 1 })
  test.store.dispatch({ kind: 'enter', cell: 1, digit: 1 })
  expect(signals[0]?.aborted).toBe(true)
  expect(test.store.conflicts).toContain(0)
  replies[0]?.({
    status: 'completed',
    value: {
      preparationWork: 1,
      computation: {
        result: {
          status: 'complete',
          violations: [{ constraintId: 'old', cells: [80], code: { kind: 'duplicate' } }],
        },
        workUsed: 1,
      },
    },
  })
  await Promise.resolve()
  expect(test.store.conflicts).not.toContain(80)
  test.store.dispose()
  expect(signals.at(-1)?.aborted).toBe(true)
})

it.each([
  'enter',
  'toggle-note',
  'undo',
  'redo',
  'pause',
  'ownership',
  'reset',
  'switch',
  'dispose',
] as const)('heavy_notes_discard_late_results_after_%s', async (change) => {
  const test = setup(true)
  await test.store.restoreSession('fixture-free-session')
  await test.store.resume()
  test.store.dispatch({ kind: 'enter', cell: 0, digit: 1 })
  if (change === 'redo') {
    test.store.dispatch({ kind: 'undo' })
  }
  let reply:
    ((value: Awaited<ReturnType<GameRuntime['worker']['generateNotes']>>) => void) | undefined
  let signal: AbortSignal | undefined
  test.runtime.worker.generateNotes = (_input, currentSignal) => {
    signal = currentSignal
    return new Promise((resolve) => {
      reply = resolve
    })
  }
  test.store.dispatch({ kind: 'generate-notes' })
  expect(test.store.notesLoading).toBe(true)
  if (change === 'enter') {
    test.store.dispatch({ kind: 'enter', cell: 1, digit: 2 })
  } else if (change === 'toggle-note') {
    test.store.dispatch({ kind: 'toggle-note', cell: 1, digit: 3 })
  } else if (change === 'undo' || change === 'redo') {
    test.store.dispatch({ kind: change })
  } else if (change === 'pause') {
    test.store.pause()
  } else if (change === 'ownership') {
    test.store.readOnly = true
  } else if (change === 'switch') {
    await test.store.restoreSession('fixture-free-session')
  } else if (change === 'reset') {
    test.store.dropSession()
  } else {
    test.store.dispose()
  }
  const before = test.store.session
  expect(signal?.aborted).toBe(true)
  reply?.({
    status: 'completed',
    value: {
      preparationWork: 1,
      computation: {
        result: {
          status: 'complete',
          entries: Array(81).fill(0),
          notes: Array(81).fill(511),
          changed: true,
          boardComplete: false,
        },
        workUsed: 100,
      },
    },
  })
  await Promise.resolve()
  expect(test.store.session).toBe(before)
  expect(test.store.notesLoading).toBe(false)
  test.store.dispose()
})

it('heavy_notes_commit_atomically_with_latest_assistance_and_keep_no_change_policy', async () => {
  const test = setup(true)
  await test.store.restoreSession('fixture-free-session')
  await test.store.resume()
  let reply:
    ((value: Awaited<ReturnType<GameRuntime['worker']['generateNotes']>>) => void) | undefined
  test.runtime.worker.generateNotes = vi.fn<GameRuntime['worker']['generateNotes']>(
    () =>
      new Promise((resolve) => {
        reply = resolve
      }),
  )
  test.store.dispatch({ kind: 'generate-notes' })
  test.store.dispatch({ kind: 'generate-notes' })
  test.store.dispatch({ kind: 'check' })
  test.store.selectCell(2)
  test.advance(1000)
  await test.store.periodicSave()
  expect(test.runtime.worker.generateNotes).toHaveBeenCalledTimes(1)
  reply?.({
    status: 'completed',
    value: {
      preparationWork: 1,
      computation: {
        result: {
          status: 'complete',
          entries: Array(81).fill(0),
          notes: Array(81).fill(0),
          changed: false,
          boardComplete: false,
        },
        workUsed: 100,
      },
    },
  })
  await Promise.resolve()
  expect(test.store.session?.assistance).toMatchObject({ checkCount: 1, candidateCount: 1 })
  expect(test.store.session?.undoStack).toHaveLength(0)
  expect(test.store.session?.elapsedMs).toBe(1000)
  test.store.dispose()
})

it.each(['failed', 'budget-exhausted'] as const)(
  'heavy_notes_preserve_every_layer_and_assistance_on_%s',
  async (status) => {
    const test = setup(true)
    await test.store.restoreSession('fixture-free-session')
    await test.store.resume()
    test.runtime.worker.generateNotes = async () =>
      status === 'failed'
        ? { status: 'failed', message: 'Fixture failure' }
        : {
            status: 'completed',
            value: {
              preparationWork: 1,
              computation: { result: { status: 'budget-exhausted' }, workUsed: 1000000 },
            },
          }
    const before = test.store.session
    test.store.dispatch({ kind: 'generate-notes' })
    await Promise.resolve()
    expect(test.store.session?.notes).toEqual(before?.notes)
    expect(test.store.session?.undoStack).toEqual(before?.undoStack)
    expect(test.store.session?.assistance).toEqual(before?.assistance)
    expect(test.store.error).toBeTruthy()
    test.store.dispose()
  },
)

it('heavy_conflicts_keep_sound_preview_on_failure_without_clock_or_assistance_restarts', async () => {
  const test = setup(true)
  test.runtime.worker.conflicts = vi.fn<GameRuntime['worker']['conflicts']>(async () => ({
    status: 'failed',
    message: 'Fixture failure',
  }))
  await test.store.restoreSession('fixture-free-session')
  await test.store.resume()
  await Promise.resolve()
  expect(test.store.conflictAnalysisState).toBe('failed')
  expect(test.store.conflictEvaluation.status).toBe('budget-exhausted')
  test.store.dispatch({ kind: 'check' })
  test.advance(1000)
  await test.store.periodicSave()
  expect(test.runtime.worker.conflicts).toHaveBeenCalledTimes(1)
  test.store.dispose()
})
