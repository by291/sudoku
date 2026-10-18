import { completeSession } from '../../../../tests/support/semantics'
import { encodeSeed } from '@/sudoku/seed'
import { isRecord } from '@/sudoku/values'
import { expect, it, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { router } from '@/router/index'
import { gameRuntimeKey } from '@/runtime'
import GameView from '@/features/game/views/GameView.vue'
import DailyView from '@/features/game/views/DailyView.vue'
import { deferred } from '../../../../tests/support/deferred'
import type { GameSession } from '@/features/game/model/session'

import { createTestRuntime } from '../../../../tests/support/runtime'
import { makeAssessment, makeSession } from '../../../../tests/support/gameFixtures'
import { useGameStore } from '@/features/game/stores/useGameStore'
import { generationInput } from '../../../../tests/support/generation'
import { VARIANT_FIXTURES } from '../../../../tests/fixtures/variants'
import type { GenerateOutcome, WorkerOutcome } from '@/worker/protocol'
import type { Puzzle } from '@/sudoku/contracts'
import { DEFAULT_SETTINGS } from '@/features/settings/model/preferences'

const runtimes: Awaited<ReturnType<typeof createTestRuntime>>[] = []

async function setup(session = makeSession()) {
  const test = await createTestRuntime()
  runtimes.push(test)
  await test.database.put('sessions', { formatVersion: 2, revision: 1, session })
  const game = test.app.runWithContext(() => useGameStore(test.pinia))
  await game.restoreSession(session.id)

  return { ...test, game }
}

afterEach(() => {
  for (const test of runtimes.splice(0)) {
    test.dispose()
  }
})

it.each(['free', 'learning', 'daily'] as const)(
  'does not replace a restored %s dataset with a Worker response when broadcasts are absent',
  async (mode) => {
    const test = await createTestRuntime()
    runtimes.push(test)
    const game = test.app.runWithContext(() => useGameStore(test.pinia))
    const metadata =
      mode === 'free'
        ? ({ kind: 'free' } as const)
        : mode === 'learning'
          ? ({ kind: 'learning', lessonId: 'rules' } as const)
          : ({ kind: 'daily', challengeDate: '2026-10-11', formalAttempt: true } as const)
    const restored = makeSession({
      id: mode === 'daily' ? 'daily:2026-10-11:formal' : 'restored-important-save',
      mode,
      metadata,
    })
    const pending = deferred<GenerateOutcome>()
    const entered = deferred<void>()
    test.runtime.worker.generate = () => {
      entered.resolve()
      return pending.promise
    }
    const generating = game.startGame(generationInput('classic', 'easy', 'pre-restore'), metadata, {
      id: mode === 'daily' ? restored.id : undefined,
    })
    await entered.promise

    expect(
      await test.runtime.repository.restoreBackup(
        JSON.stringify({
          backupVersion: 1,
          exportedAt: '2026-10-14T03:00:00.000Z',
          sessions: [{ formatVersion: 2, revision: 7, session: restored }],
          results: [],
          lessons: [],
          settings: DEFAULT_SETTINGS,
        }),
        1,
      ),
    ).toMatchObject({ ok: true })
    pending.resolve({ status: 'completed', value: { ...restored.puzzle, seed: 'stale-worker' } })

    expect(await generating).toEqual({ status: 'cancelled' })
    expect(game.session).toBeNull()
    expect(await test.runtime.repository.listSessions()).toEqual({
      ok: true,
      value: [{ formatVersion: 2, revision: 1, session: restored }],
    })
    game.dispose()
  },
)

it.each(['acquire', 'write'] as const)(
  'preserves restoration that races with generation %s before a delayed broadcast arrives',
  async (stage) => {
    const test = await createTestRuntime()
    runtimes.push(test)
    const game = test.app.runWithContext(() => useGameStore(test.pinia))
    const entered = deferred<void>()
    const gate = deferred<void>()
    test.runtime.worker.generate = async () => ({
      status: 'completed',
      value: makeSession().puzzle,
    })
    if (stage === 'acquire') {
      const acquire = test.runtime.ownership.acquireOwnership
      test.runtime.ownership.acquireOwnership = async (...args) => {
        entered.resolve()
        await gate.promise
        return acquire(...args)
      }
    } else {
      const write = test.runtime.repository.replaceActiveSession
      test.runtime.repository.replaceActiveSession = async (...args) => {
        entered.resolve()
        await gate.promise
        return write(...args)
      }
    }
    const generating = game.startGame(generationInput('classic', 'easy', 'racing-restore'), {
      kind: 'free',
    })
    await entered.promise
    const restored = makeSession({ id: 'restored-after-catalogue' })
    await test.runtime.repository.restoreBackup(
      JSON.stringify({
        backupVersion: 1,
        exportedAt: '2026-10-14T03:00:00.000Z',
        sessions: [{ formatVersion: 2, revision: 1, session: restored }],
        results: [],
        lessons: [],
        settings: DEFAULT_SETTINGS,
      }),
      1,
    )

    gate.resolve()
    expect((await generating).status).not.toBe('ready')
    expect(game.session).toBeNull()
    expect(await test.runtime.repository.listSessions()).toEqual({
      ok: true,
      value: [{ formatVersion: 2, revision: 1, session: restored }],
    })
    game.dispose()
  },
)

it.each(['rated', 'unavailable'] as const)(
  'installs %s metadata, retains it on restart, and restores without assessment work',
  async (status) => {
    const test = await setup()
    const puzzle = makeSession().puzzle
    const assessment =
      status === 'rated'
        ? makeAssessment(puzzle)
        : { status: 'unavailable' as const, reason: 'ungraded' as const, issues: [] }
    const assess = vi.spyOn(test.runtime.worker, 'assess')
    test.runtime.worker.generate = vi.fn(async () => ({
      status: 'completed' as const,
      value: puzzle,
      assessment,
    }))

    expect(
      await test.game.startGame(generationInput('classic', 'easy', 'snapshot'), {
        kind: 'free',
      }),
    ).toEqual({ status: 'ready' })
    expect(test.game.session?.assessment).toEqual(assessment)
    await test.game.restartFree()

    expect(test.game.session?.assessment).toEqual(assessment)
    const id = test.game.session?.id
    if (!id) {
      throw new Error('Missing installed session')
    }
    await test.game.leaveGame()
    test.game.dropSession()
    await test.game.restoreSession(id)

    expect(test.game.session?.assessment).toEqual(assessment)
    expect(assess).not.toHaveBeenCalled()
    expect(test.runtime.worker.generate).toHaveBeenCalledTimes(1)
  },
)

it.each(['cancel', 'switch', 'reset'] as const)(
  'fences the puzzle and assessment after %s while generation is pending',
  async (action) => {
    const original = makeSession({ assessment: makeAssessment() })
    const test = await setup(original)
    const pending = deferred<GenerateOutcome>()
    const entered = deferred<void>()
    test.runtime.worker.generate = () => {
      entered.resolve()
      return pending.promise
    }
    const starting = test.game.startGame(generationInput('classic', 'easy', 'late'), {
      kind: 'free',
    })
    await entered.promise
    if (action === 'cancel') {
      test.game.cancelLoading()
    } else if (action === 'switch') {
      await test.game.restoreSession(original.id)
    } else {
      await test.runtime.repository.clearAll()
      test.game.dropSession()
    }
    pending.resolve({
      status: 'completed',
      value: { ...original.puzzle, seed: 'late' },
      assessment: { status: 'unavailable', reason: 'ungraded', issues: [] },
    })

    expect(await starting).toEqual({ status: 'cancelled' })
    if (action === 'reset') {
      expect(test.game.session).toBeNull()
    } else {
      expect(test.game.session?.puzzle).toEqual(original.puzzle)
      expect(test.game.session?.assessment).toEqual(original.assessment)
    }
  },
)

it('releases a delayed acquired lease exactly once after cancellation', async () => {
  const test = await setup()
  await test.game.leaveGame()
  const acquire = test.runtime.ownership.acquireOwnership
  const pending = deferred<void>()
  const entered = deferred<void>()
  test.runtime.ownership.acquireOwnership = async (id, owner) => {
    const result = await acquire(id, owner)
    entered.resolve()
    await pending.promise

    return result
  }
  const release = vi.spyOn(test.runtime.ownership, 'releaseOwnership')

  const resuming = test.game.resume()
  await entered.promise
  test.game.cancelLoading()
  pending.resolve()
  await resuming

  expect(release).toHaveBeenCalledTimes(1)
  expect(test.game.phase).toBe('paused')
})

it('releases an independently acquired previous lease after cancellation during a denied replacement epoch read', async () => {
  const test = await setup()
  await test.game.leaveGame()
  test.game.dropSession()

  const previousId = makeSession().id
  const acquire = test.runtime.ownership.acquireOwnership
  const readEpoch = test.runtime.repository.readDatasetEpoch
  const entered = deferred<void>()
  const gate = deferred<void>()
  let deniedReplacement = false
  test.runtime.worker.generate = async () => ({ status: 'completed', value: makeSession().puzzle })
  test.runtime.ownership.acquireOwnership = async (id, owner) => {
    if (id === previousId) {
      return acquire(id, owner)
    }

    deniedReplacement = true
    return { ok: true, value: null }
  }
  test.runtime.repository.readDatasetEpoch = async () => {
    if (deniedReplacement) {
      entered.resolve()
      await gate.promise
    }

    return readEpoch()
  }
  const replace = vi.spyOn(test.runtime.repository, 'replaceActiveSession')
  const starting = test.game.startGame(generationInput('classic', 'easy', 'denied-cancel'), {
    kind: 'free',
  })
  await entered.promise
  expect(await test.database.get('leases', previousId)).toMatchObject({
    ownerId: test.runtime.ownerId,
  })

  test.game.cancelLoading()
  gate.resolve()

  expect(await starting).toEqual({ status: 'cancelled' })
  expect(await test.database.get('leases', previousId)).toMatchObject({ expiresAt: 0 })
  expect(replace).not.toHaveBeenCalled()
  expect(test.game.session).toBeNull()
  expect(test.game.error).toBe('已取消出题。')
  expect(await test.database.count('sessions')).toBe(1)
})

it('preserves the restored lease and subsequent save when superseding a denied replacement', async () => {
  const test = await setup()
  await test.game.leaveGame()
  test.game.dropSession()

  const previousId = makeSession().id
  const acquire = test.runtime.ownership.acquireOwnership
  const readEpoch = test.runtime.repository.readDatasetEpoch
  const entered = deferred<void>()
  const gate = deferred<void>()
  let pauseEpochRead = false
  test.runtime.worker.generate = async () => ({ status: 'completed', value: makeSession().puzzle })
  test.runtime.ownership.acquireOwnership = async (id, owner) => {
    if (id === previousId) {
      return acquire(id, owner)
    }

    pauseEpochRead = true
    return { ok: true, value: null }
  }
  test.runtime.repository.readDatasetEpoch = async () => {
    if (pauseEpochRead) {
      pauseEpochRead = false
      entered.resolve()
      await gate.promise
    }

    return readEpoch()
  }
  const starting = test.game.startGame(generationInput('classic', 'easy', 'denied-supersede'), {
    kind: 'free',
  })
  await entered.promise

  const restoring = test.game.restoreSession(previousId)
  await flushPromises()
  gate.resolve()

  expect(await restoring).toEqual({ status: 'ready' })
  expect(await starting).toEqual({ status: 'cancelled' })
  expect(test.game.session?.id).toBe(previousId)
  expect(test.game.readOnly).toBe(false)
  const restoredLease = await test.database.get('leases', previousId)
  expect(isRecord(restoredLease) && restoredLease.expiresAt).toBeGreaterThan(0)

  await test.game.resume()
  test.game.dispatch({ kind: 'enter', cell: 2, digit: 4 })
  await test.game.periodicSave()

  expect(test.game.saveState).toBe('saved')
  expect(test.game.readOnly).toBe(false)
  const stored = await test.runtime.repository.readSession(previousId)
  expect(stored.ok && stored.value?.session.entries[2]).toBe(4)
})

it('releases the current editing lease once when replacing its own game', async () => {
  const test = await setup()
  const release = vi.spyOn(test.runtime.ownership, 'releaseOwnership')
  test.runtime.worker.generate = async () => ({ status: 'completed', value: makeSession().puzzle })

  await test.game.startGame(generationInput('classic', 'easy', 'replacement'), {
    kind: 'free',
  })

  expect(release.mock.calls.filter(([token]) => token.sessionId === makeSession().id)).toHaveLength(
    1,
  )
})

it.each(['acquisition-failed', 'acquisition-denied', 'replacement-failed'] as const)(
  'does not publish %s replacement after reset during old-lease cleanup',
  async (failure) => {
    const test = await setup()
    await test.game.leaveGame()
    test.game.dropSession()

    const oldSessionId = makeSession().id
    const acquire = test.runtime.ownership.acquireOwnership
    const release = test.runtime.ownership.releaseOwnership
    const cleanupEntered = deferred<void>()
    const cleanupGate = deferred<void>()
    test.runtime.worker.generate = async () => ({
      status: 'completed',
      value: makeSession().puzzle,
    })
    test.runtime.ownership.acquireOwnership = async (id, owner) => {
      if (id !== oldSessionId && failure === 'acquisition-failed') {
        return { ok: false, error: { kind: 'unavailable', message: 'Injected lease failure' } }
      }

      if (id !== oldSessionId && failure === 'acquisition-denied') {
        return { ok: true, value: null }
      }

      return acquire(id, owner)
    }
    test.runtime.ownership.releaseOwnership = async (token) => {
      if (token.sessionId === oldSessionId) {
        cleanupEntered.resolve()
        await cleanupGate.promise
      }

      return release(token)
    }
    if (failure === 'replacement-failed') {
      test.runtime.repository.replaceActiveSession = async () => ({
        ok: false,
        error: { kind: 'write-failed', message: 'Injected replacement failure' },
      })
    }

    const starting = test.game.startGame(generationInput('classic', 'easy', 'cleanup-reset'), {
      kind: 'free',
    })
    await cleanupEntered.promise
    await test.runtime.repository.clearAll()
    test.game.dropSession()
    cleanupGate.resolve()

    expect(await starting).toEqual({ status: 'cancelled' })
    expect(test.game.session).toBeNull()
    expect(test.game.phase).toBe('paused')
    expect(test.game.saveState).toBe('idle')
    expect(test.game.canRetryGeneration).toBe(false)
    expect(await test.database.count('sessions')).toBe(0)
  },
)

it('retains an unsaved session after a failed type switch and retries before installing the requested type', async () => {
  const test = await setup()
  const write = test.runtime.repository.writeSession
  let time = 0
  test.runtime.monotonicNow = () => time
  test.runtime.repository.writeSession = async () => ({
    ok: false,
    error: { kind: 'write-failed', message: 'Injected failure' },
  })
  test.runtime.worker.generate = vi.fn(async (input) => ({
    status: 'completed' as const,
    value: {
      ...makeSession().puzzle,
      ...VARIANT_FIXTURES.arrow,
      ...input,
      seed: encodeSeed(input.seed),
    },
  }))
  await test.game.resume()
  test.game.dispatch({ kind: 'enter', cell: 2, digit: 4 })
  time = 3000
  const input = generationInput('arrow', 'easy', 'switch')

  expect(await test.game.startGame(input, { kind: 'free' })).toEqual({
    status: 'blocked',
    reason: 'save',
  })
  expect(test.runtime.worker.generate).not.toHaveBeenCalled()
  expect(test.game.session?.id).toBe(makeSession().id)
  expect(test.game.board[2]).toBe(4)
  expect(test.game.elapsedMs).toBe(3000)
  expect(test.game.readOnly).toBe(false)
  test.runtime.repository.writeSession = write

  expect(await test.game.startGame(input, { kind: 'free' })).toEqual({ status: 'ready' })
  expect(test.game.activeVariant).toBe('arrow')
  const saved = await test.runtime.repository.listSessions()

  expect(saved).toMatchObject({
    ok: true,
    value: expect.arrayContaining([
      expect.objectContaining({
        session: expect.objectContaining({ id: makeSession().id, elapsedMs: 3000 }),
      }),
    ]),
  })
})

it('ignores a late previous-type generation', async () => {
  const test = await setup()
  const first = deferred<WorkerOutcome<Puzzle>>()
  const entered = deferred<void>()
  test.runtime.worker.generate = async (input) => {
    if (input.variant === 'arrow') {
      entered.resolve()

      return first.promise
    }

    return {
      status: 'completed',
      value: {
        ...makeSession().puzzle,
        ...VARIANT_FIXTURES.thermo,
        ...input,
        seed: encodeSeed(input.seed),
      },
    }
  }
  const pending = test.game.startGame(generationInput('arrow', 'easy', 'first'), {
    kind: 'free',
  })
  await entered.promise

  expect(
    await test.game.startGame(generationInput('thermo', 'easy', 'second'), { kind: 'free' }),
  ).toEqual({ status: 'ready' })
  first.resolve({
    status: 'completed',
    value: { ...makeSession().puzzle, ...VARIANT_FIXTURES.arrow },
  })

  expect(await pending).toEqual({ status: 'cancelled' })
  expect(test.game.activeVariant).toBe('thermo')
})

it('retains unsaved entries, history, time and assistance across release and resume', async () => {
  const test = await setup()
  let time = 0
  test.runtime.monotonicNow = () => time
  const write = test.runtime.repository.writeSession
  test.runtime.repository.writeSession = async () => ({
    ok: false,
    error: { kind: 'write-failed', message: 'Injected write failure' },
  })
  await test.game.resume()
  test.game.dispatch({ kind: 'enter', cell: 2, digit: 4 })
  test.game.dispatch({ kind: 'check' })
  time = 3000
  await test.game.periodicSave()
  await test.game.leaveGame()
  test.runtime.repository.writeSession = write
  await test.game.resume()

  expect(test.game.board[2]).toBe(4)
  expect(test.game.session?.undoStack).toHaveLength(1)
  expect(test.game.session?.assistance.checkCount).toBe(1)
  expect(test.game.elapsedMs).toBe(3000)
  await test.game.retrySave()
  const stored = await test.runtime.repository.listSessions()

  expect(stored).toMatchObject({
    ok: true,
    value: [{ session: { entries: test.game.session?.entries } }],
  })
  await test.game.leaveGame()
})

it('retains an unsaved completion after release and retries its result exactly once', async () => {
  const base = makeSession()
  const entries = base.puzzle.solution.map((digit, cell) => (base.puzzle.givens[cell] ? 0 : digit))
  entries[2] = 0
  const test = await setup(makeSession({ entries }))
  const write = test.runtime.repository.writeSession
  test.runtime.repository.writeSession = async () => ({
    ok: false,
    error: { kind: 'write-failed', message: 'Injected' },
  })
  await test.game.resume()
  test.game.dispatch({ kind: 'enter', cell: 2, digit: 4 })
  await test.game.leaveGame()
  test.runtime.repository.writeSession = write
  await test.game.retrySave()
  await test.game.retrySave()

  expect(test.game.phase).toBe('completed')
  expect(await test.database.count('results')).toBe(1)
})
it('preserves the dirty game and reports a peer revision conflict instead of overwriting it', async () => {
  const test = await setup()
  test.runtime.repository.writeSession = async () => ({
    ok: false,
    error: { kind: 'write-failed', message: 'Injected' },
  })
  await test.game.resume()
  test.game.dispatch({ kind: 'enter', cell: 2, digit: 4 })
  await test.game.leaveGame()
  await test.database.put('sessions', { formatVersion: 2, revision: 2, session: makeSession() })
  await test.game.resume()

  expect(test.game.board[2]).toBe(4)
  expect(test.game.readOnly).toBe(true)
  expect(test.game.phase).toBe('paused')
  await test.game.leaveGame()
})

it.each(['revision-conflict', 'ownership-lost'] as const)(
  'reloads the latest saved record through explicit recovery after %s',
  async (conflict) => {
    const test = await setup()
    const id = makeSession().id
    await test.game.resume()
    const latest = makeSession({
      entries: makeSession().entries.map((digit, cell) => (cell === 3 ? 6 : digit)),
    })
    await test.database.put('sessions', { formatVersion: 2, revision: 2, session: latest })
    if (conflict === 'ownership-lost') {
      await test.database.delete('leases', id)
    }

    test.game.dispatch({ kind: 'enter', cell: 2, digit: 4 })
    await test.game.periodicSave()

    expect(test.game.readOnly).toBe(true)
    expect(test.game.board[2]).toBe(4)
    expect(await test.game.restoreSession(id)).toEqual({ status: 'blocked', reason: 'ownership' })
    expect(await test.game.reloadLatestSession()).toEqual({ status: 'ready' })
    expect(test.game.board[2]).toBe(0)
    expect(test.game.board[3]).toBe(6)
    expect(test.game.readOnly).toBe(false)
    expect(test.game.saveMessage).toBeNull()
    await test.game.resume()
    test.game.dispatch({ kind: 'enter', cell: 2, digit: 4 })
    await test.game.periodicSave()
    const records = await test.runtime.repository.listSessions()
    if (!records.ok) {
      throw new Error('Missing recovered session')
    }

    const saved = records.value.find((record) => record.session.id === id)

    expect(saved).toMatchObject({
      session: { entries: latest.entries.map((digit, cell) => (cell === 2 ? 4 : digit)) },
    })
    expect(saved?.revision).toBeGreaterThan(2)
  },
)

it('keeps unsaved conflicted edits when explicit recovery cannot read storage', async () => {
  const test = await setup()
  await test.game.resume()
  await test.database.put('sessions', { formatVersion: 2, revision: 2, session: makeSession() })
  test.game.dispatch({ kind: 'enter', cell: 2, digit: 4 })
  await test.game.periodicSave()
  test.runtime.repository.readSession = async () => ({
    ok: false,
    error: { kind: 'unavailable', message: 'Injected read failure' },
  })

  expect(await test.game.reloadLatestSession()).toEqual({ status: 'blocked', reason: 'load' })
  expect(test.game.board[2]).toBe(4)
  expect(test.game.readOnly).toBe(true)
  expect(await test.database.get('leases', makeSession().id)).toMatchObject({ expiresAt: 0 })
})
it('does not restore after reset during release of the previous lease', async () => {
  const test = await setup()
  const gate = deferred<void>()
  const entered = deferred<void>()
  const release = test.runtime.ownership.releaseOwnership
  test.runtime.ownership.releaseOwnership = async (token) => {
    entered.resolve()
    await gate.promise

    return release(token)
  }
  const restoring = test.game.restoreSession(makeSession().id)
  await entered.promise
  test.game.dropSession()
  gate.resolve()
  await restoring

  expect(test.game.session).toBeNull()
})

it('does not resume a game after leaving while its catalog read is pending', async () => {
  const test = await setup()
  await test.game.leaveGame()
  const gate = deferred<void>()
  const entered = deferred<void>()
  const read = test.runtime.repository.readSession
  test.runtime.repository.readSession = async (id) => {
    entered.resolve()
    await gate.promise

    return read(id)
  }
  const resuming = test.game.resume()
  await entered.promise
  await test.game.leaveGame()
  gate.resolve()
  await resuming

  expect(test.game.phase).toBe('paused')
})
it('keeps a peer-completed game locked when reacquiring its latest save', async () => {
  const test = await setup()
  await test.game.leaveGame()
  const base = makeSession()
  const completed = completeSession(
    makeSession({
      entries: base.puzzle.solution.map((digit, cell) => (base.puzzle.givens[cell] ? 0 : digit)),
    }),
    '2026-10-11T01:01:00.000Z',
    1234,
  )
  await test.database.put('sessions', { formatVersion: 2, revision: 2, session: completed })
  await test.game.resume()

  expect(test.game.phase).toBe('completed')
  expect(test.game.editable).toBe(false)
  expect(test.game.elapsedMs).toBe(1234)
  await test.game.leaveGame()
})

it('does not retry or recreate a game after reset while its catalog read is pending', async () => {
  const test = await setup()
  await test.game.leaveGame()
  const gate = deferred<void>()
  const entered = deferred<void>()
  const read = test.runtime.repository.readSession
  test.runtime.repository.readSession = async (id) => {
    entered.resolve()
    await gate.promise

    return read(id)
  }
  const retrying = test.game.retrySave()
  await entered.promise
  await test.runtime.repository.clearAll()
  test.game.dropSession()
  gate.resolve()
  await expect(retrying).resolves.toBeUndefined()

  expect(test.game.session).toBeNull()
  expect(await test.database.count('sessions')).toBe(0)
})

it('does not create a daily game after leaving and resetting a pending startup', async () => {
  const test = await setup()
  const gate = deferred<void>()
  const entered = deferred<void>()
  const read = test.runtime.repository.readSession
  test.runtime.repository.readSession = async (id) => {
    entered.resolve()
    await gate.promise

    return read(id)
  }
  test.runtime.worker.generate = async () => ({
    status: 'completed',
    value: { ...makeSession().puzzle, difficulty: 'medium' },
  })
  const starting = test.game.startDaily('2026-10-11', 'classic')
  await entered.promise
  await test.game.leaveGame()
  await test.runtime.repository.clearAll()
  test.game.dropSession()
  gate.resolve()
  await starting

  expect(test.game.session).toBeNull()
  expect(await test.database.count('sessions')).toBe(0)
})

for (const component of [GameView, DailyView]) {
  it(`does not restore an unmounted ${component === GameView ? 'free' : 'daily'} page from a delayed initializer`, async () => {
    const session: GameSession =
      component === GameView
        ? makeSession()
        : makeSession({
            id: 'daily:2026-10-11:formal',
            mode: 'daily',
            metadata: { kind: 'daily', challengeDate: '2026-10-11', formalAttempt: true },
          })
    const test = await setup(session)
    test.game.dropSession()
    await router.push(component === GameView ? '/play/free' : '/play/daily')
    const gate = deferred<void>()
    const entered = deferred<void>()
    if (component === GameView) {
      const snapshot = await test.runtime.repository.readSlotSummary('free', 'classic')
      test.runtime.repository.readSlotSummary = async () => {
        entered.resolve()
        await gate.promise
        return snapshot
      }
    } else {
      const snapshot = await test.runtime.repository.readDailyStatuses('2026-10-11')
      test.runtime.repository.readDailyStatuses = async () => {
        entered.resolve()
        await gate.promise
        return snapshot
      }
    }
    const restore = vi.spyOn(test.game, 'restoreSession')
    const wrapper = mount(component, {
      global: { plugins: [test.pinia, router], provide: { [gameRuntimeKey]: test.runtime } },
    })
    await entered.promise
    wrapper.unmount()
    await flushPromises()
    gate.resolve()
    await flushPromises()

    expect(restore).not.toHaveBeenCalled()
    expect(test.game.session).toBeNull()
  })
}
it('does not create or install a cancelled game while its catalog read is pending', async () => {
  const test = await createTestRuntime()
  const original = test.runtime.repository.readSlot
  let unblock: () => void = () => {
    throw new Error('Gate not initialized')
  }
  let entered: () => void = () => {
    throw new Error('Gate not initialized')
  }
  const gate = new Promise<void>((resolve) => {
    unblock = resolve
  })
  const reading = new Promise<void>((resolve) => {
    entered = resolve
  })
  test.runtime.repository.readSlot = async (mode, variant) => {
    entered()
    await gate

    return original(mode, variant)
  }
  test.runtime.worker.generate = async () => ({ status: 'completed', value: makeSession().puzzle })
  const game = test.app.runWithContext(() => useGameStore(test.pinia))
  const job = game.startGame(generationInput('classic', 'easy', 'cancel-before-commit'), {
    kind: 'free',
  })
  await reading
  game.cancelLoading()
  unblock()
  await job

  expect(game.session).toBeNull()
  expect(game.phase).toBe('failed')
  expect(await test.database.count('sessions')).toBe(0)
  await game.leaveGame()
  game.dispose()
  test.dispose()
})

it('captures_seed_bytes_before_save_preparation_and_retains_them_for_retry', async () => {
  const test = await setup()
  const input = generationInput('classic', 'easy', 'owned-before-save')
  const expected = input.seed.slice()
  const generate = vi
    .fn<typeof test.runtime.worker.generate>()
    .mockResolvedValue({ status: 'timed-out' })
  test.runtime.worker.generate = generate

  const pending = test.game.startGame(input, { kind: 'free' })
  input.seed.fill(255)
  await pending
  await test.game.retryGeneration()

  expect(generate).toHaveBeenCalledTimes(2)
  expect(generate.mock.calls.map(([request]) => request.seed)).toEqual([expected, expected])
  await test.game.leaveGame()
  test.game.dispose()
  test.dispose()
})

it('restores the selected save without reading unrelated full records', async () => {
  const test = await createTestRuntime()
  runtimes.push(test)
  const selected = makeSession()
  await test.database.put('sessions', { formatVersion: 2, revision: 1, session: selected })
  const sessions = vi.spyOn(test.runtime.repository, 'listSessions')
  const results = vi.spyOn(test.runtime.repository, 'listResults')
  const game = test.app.runWithContext(() => useGameStore(test.pinia))

  expect(await game.restoreSession(selected.id)).toEqual({ status: 'ready' })

  expect(game.session?.id).toBe(selected.id)
  expect(sessions).not.toHaveBeenCalled()
  expect(results).not.toHaveBeenCalled()
})
