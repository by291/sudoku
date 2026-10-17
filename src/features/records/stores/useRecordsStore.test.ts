import { initialSummaryState } from '@/storage/projections'
import { expect, it, vi } from 'vitest'
import { unwrap } from 'idb'
import { createTestRuntime } from '../../../../tests/support/runtime'
import { makeSession } from '../../../../tests/support/gameFixtures'
import { useRecordsStore } from '@/features/records/stores/useRecordsStore'
import { usePreferencesStore } from '@/features/settings/stores/usePreferencesStore'
import { useGameStore } from '@/features/game/stores/useGameStore'
import { DEFAULT_SETTINGS } from '@/features/settings/model/preferences'
import { useLearningStore } from '@/features/learning/stores/useLearningStore'
import type { OwnershipNotice } from '@/storage/ownership'
import { deferred } from '../../../../tests/support/deferred'
import { generationInput } from '../../../../tests/support/generation'

it('distinguishes an unread overview from an empty successfully loaded overview', async () => {
  const test = await createTestRuntime()
  const records = test.app.runWithContext(() => useRecordsStore(test.pinia))
  const pending = deferred<Awaited<ReturnType<typeof test.runtime.repository.readOverview>>>()
  const read = vi.spyOn(test.runtime.repository, 'readOverview').mockReturnValue(pending.promise)

  const loading = records.load()

  expect(records.loaded).toBe(false)
  expect(records.summary).toBeNull()
  expect(records.busy).toBe(true)
  pending.resolve({ ok: false, error: { kind: 'unavailable', message: 'Injected failure' } })
  await loading
  expect(records.loaded).toBe(false)
  expect(records.error).toContain('读取失败')

  read.mockRestore()
  await records.load()

  expect(records.loaded).toBe(true)
  expect(records.completedCount).toBe(0)
  records.dispose()
  test.dispose()
})

it('removes stale completed snapshots immediately when a peer replaces the dataset', async () => {
  const test = await createTestRuntime()
  const listeners: ((notice: OwnershipNotice) => void)[] = []
  vi.spyOn(test.runtime.ownership, 'subscribe').mockImplementation((listener) => {
    listeners.push(listener)
    return () => {}
  })
  const records = test.app.runWithContext(() => useRecordsStore(test.pinia))
  const session = makeSession({
    elapsedMs: 61000,
    completion: { completedAt: '2026-10-11T01:00:00.000Z', elapsedMs: 61000 },
  })
  session.entries = session.puzzle.solution.map((digit, cell) =>
    session.puzzle.givens[cell] ? 0 : digit,
  )
  await test.database.put('results', { formatVersion: 2, session })
  await records.loadResult(session.id)
  expect(records.result?.session.id).toBe(session.id)
  const pending = deferred<Awaited<ReturnType<typeof test.runtime.repository.readResult>>>()
  vi.spyOn(test.runtime.repository, 'readResult').mockReturnValue(pending.promise)

  for (const listener of listeners) {
    listener({ kind: 'reset', epoch: 2 })
  }

  expect(records.loaded).toBe(false)
  expect(records.result).toBeNull()
  pending.resolve({ ok: true, value: null })
  await vi.waitFor(() => expect(records.loaded).toBe(true))
  expect(records.result).toBeNull()
  records.dispose()
  test.dispose()
})

it('settles dirty game and queued preferences before returning a committed backup', async () => {
  const test = await createTestRuntime()
  const records = test.app.runWithContext(() => useRecordsStore(test.pinia))
  const preferences = test.app.runWithContext(() => usePreferencesStore(test.pinia))
  const game = test.app.runWithContext(() => useGameStore(test.pinia))
  await test.database.put('sessions', { formatVersion: 2, revision: 1, session: makeSession() })
  await game.restoreSession(makeSession().id)
  await game.resume()
  game.selectCell(2)
  game.dispatch({ kind: 'enter', cell: 2, digit: 4 })
  const saving = preferences.update({ theme: 'dark' })

  const text = await records.exportBackup()
  await saving
  expect(text).not.toBeNull()
  expect(JSON.parse(text ?? '{}')).toMatchObject({
    sessions: [{ session: { entries: game.session?.entries } }],
    settings: { theme: 'dark' },
  })
  expect(game.phase).toBe('paused')
  records.dispose()
  game.dispose()
  test.dispose()
})

it('keeps unsaved edits recoverable and blocks export when their write fails', async () => {
  const test = await createTestRuntime()
  const records = test.app.runWithContext(() => useRecordsStore(test.pinia))
  const game = test.app.runWithContext(() => useGameStore(test.pinia))
  await test.database.put('sessions', { formatVersion: 2, revision: 1, session: makeSession() })
  await game.restoreSession(makeSession().id)
  await game.resume()
  const spy = vi
    .spyOn(test.runtime.repository, 'writeSession')
    .mockResolvedValue({ ok: false, error: { kind: 'write-failed', message: 'Injected failure' } })
  game.dispatch({ kind: 'enter', cell: 2, digit: 4 })

  expect(await records.exportBackup()).toBeNull()
  expect(records.backupError).toContain('保存')
  expect(game.session?.entries[2]).toBe(4)
  spy.mockRestore()
  expect(await records.exportBackup()).not.toBeNull()
  records.dispose()
  game.dispose()
  test.dispose()
})

it('reloads imported preferences and lessons after a peer dataset reset', async () => {
  const test = await createTestRuntime()
  const listeners: ((notice: OwnershipNotice) => void)[] = []
  vi.spyOn(test.runtime.ownership, 'subscribe').mockImplementation((listener) => {
    listeners.push(listener)
    return () => {}
  })
  const records = test.app.runWithContext(() => useRecordsStore(test.pinia))
  const preferences = test.app.runWithContext(() => usePreferencesStore(test.pinia))
  const learning = test.app.runWithContext(() => useLearningStore(test.pinia))
  await preferences.load()
  await test.database.put('settings', { ...DEFAULT_SETTINGS, theme: 'dark' }, 'preferences')
  await test.database.put('lessons', { lessonId: 'rules', completedAt: '2026-10-11T01:00:00.000Z' })

  for (const listener of listeners) {
    listener({ kind: 'reset', epoch: 2 })
  }
  await vi.waitFor(() => expect(preferences.settings.theme).toBe('dark'))
  await vi.waitFor(() => expect(learning.progress).toHaveLength(1))

  records.dispose()
  test.dispose()
})

it('validates a preview, confirms replacement, resets late worker delivery and reloads preferences', async () => {
  const test = await createTestRuntime()
  const records = test.app.runWithContext(() => useRecordsStore(test.pinia))
  const preferences = test.app.runWithContext(() => usePreferencesStore(test.pinia))
  const game = test.app.runWithContext(() => useGameStore(test.pinia))
  const pending = deferred<Awaited<ReturnType<typeof test.runtime.worker.generate>>>()
  vi.spyOn(test.runtime.worker, 'generate').mockReturnValue(pending.promise)
  const generating = game.startGame(generationInput('classic', 'easy', 'late-backup'), {
    kind: 'free',
  })
  await vi.waitFor(() => expect(test.runtime.worker.generate).toHaveBeenCalledOnce())
  const text = JSON.stringify({
    backupVersion: 1,
    exportedAt: '2026-10-14T03:00:00.000Z',
    sessions: [{ formatVersion: 2, revision: 99, session: makeSession() }],
    results: [],
    lessons: [{ lessonId: 'rules', completedAt: '2026-10-11T01:00:00.000Z' }],
    settings: { ...DEFAULT_SETTINGS, theme: 'dark' },
  })

  await records.previewRestore(text)
  expect(records.backupPreview).toMatchObject({ sessions: 1, results: 0, lessons: 1 })
  expect(await test.database.count('sessions')).toBe(0)
  await records.load({ tab: 'saves', variant: 'classic' })
  await records.restoreBackup()
  pending.resolve({
    status: 'completed',
    value: makeSession().puzzle,
    assessment: { status: 'unavailable', reason: 'invalid-summary', issues: [] },
  })
  await generating

  expect(game.session).toBeNull()
  expect(preferences.settings.theme).toBe('dark')
  expect(records.rows).toHaveLength(1)
  expect(records.notice).toContain('恢复')
  expect(await test.database.get('meta', 'epoch')).toBe(2)
  await game.restoreSession(makeSession().id)
  expect(game.phase).toBe('paused')
  records.dispose()
  game.dispose()
  test.dispose()
})

it('clears all player stores and resets in-memory preferences only after commit', async () => {
  const test = await createTestRuntime()
  const records = test.app.runWithContext(() => useRecordsStore(test.pinia))
  const preferences = test.app.runWithContext(() => usePreferencesStore(test.pinia))
  const game = test.app.runWithContext(() => useGameStore(test.pinia))
  await preferences.update({ theme: 'dark', currentLessonId: 'rules' })
  await test.runtime.repository.writeLessonProgress(
    {
      lessonId: 'rules',
      completedAt: '2026-10-11T01:00:00.000Z',
    },
    1,
  )
  const session = makeSession()
  await test.database.put('sessions', { formatVersion: 2, revision: 1, session })
  await game.restoreSession(session.id)
  await test.database.put('meta', initialSummaryState(false), 'summaries')
  expect((await test.runtime.repository.maintainSummaries()).ok).toBe(true)
  await records.load({ tab: 'saves', variant: 'classic' })

  expect(records.rows).toHaveLength(1)
  await records.clearLocalData()

  expect(records.notice).toContain('已清空')
  expect(game.session).toBeNull()
  expect(preferences.settings).toMatchObject({ theme: 'system', currentLessonId: null })

  for (const store of [
    'sessions',
    'results',
    'lessons',
    'settings',
    'leases',
    'quarantine',
  ] as const) {
    expect(await test.database.count(store)).toBe(0)
  }

  expect(await test.database.get('meta', 'epoch')).toBe(2)
  records.dispose()
  game.dispose()
  test.dispose()
})
it('retains recoverable records and current preferences when reset aborts', async () => {
  const test = await createTestRuntime()
  const records = test.app.runWithContext(() => useRecordsStore(test.pinia))
  const preferences = test.app.runWithContext(() => usePreferencesStore(test.pinia))
  await preferences.update({ theme: 'dark' })
  await test.database.put('sessions', { formatVersion: 2, revision: 1, session: makeSession() })
  await test.database.put('meta', initialSummaryState(false), 'summaries')
  expect((await test.runtime.repository.maintainSummaries()).ok).toBe(true)
  await records.load({ tab: 'saves', variant: 'classic' })
  const raw = unwrap(test.database)
  const original = raw.transaction.bind(raw)
  const spy = vi.spyOn(raw, 'transaction').mockImplementation((...args) => {
    const transaction = original(...args)
    queueMicrotask(() => transaction.abort())

    return transaction
  })
  await records.clearLocalData()
  spy.mockRestore()

  expect(records.error).toContain('清空失败')
  expect(records.rows).toHaveLength(1)
  expect(preferences.settings.theme).toBe('dark')
  expect(await test.database.count('sessions')).toBe(1)
  records.dispose()
  test.dispose()
})

it('loads only the selected overview without reading full payload collections or quarantine', async () => {
  const test = await createTestRuntime()
  const records = test.app.runWithContext(() => useRecordsStore(test.pinia))
  const sessions = vi.spyOn(test.runtime.repository, 'listSessions')
  const results = vi.spyOn(test.runtime.repository, 'listResults')
  const quarantine = vi.spyOn(test.runtime.repository, 'countQuarantined')

  await records.load({ tab: 'overview', variant: 'classic' })

  expect(sessions).not.toHaveBeenCalled()
  expect(results).not.toHaveBeenCalled()
  expect(quarantine).not.toHaveBeenCalled()
  expect(records.summary).toMatchObject({ currentStreak: 0, longestStreak: 0 })
  records.dispose()
  test.dispose()
})

it('keeps pages bounded and can return to earlier records beyond the retention limit', async () => {
  const test = await createTestRuntime()
  const records = test.app.runWithContext(() => useRecordsStore(test.pinia))
  for (let index = 0; index < 135; index++) {
    const session = makeSession({
      id: `completed-${String(index).padStart(3, '0')}`,
      completion: { completedAt: '2026-10-11T01:00:00.000Z', elapsedMs: 0 },
    })
    session.entries = session.puzzle.solution.map((digit, cell) =>
      session.puzzle.givens[cell] ? 0 : digit,
    )
    await test.database.put('results', { formatVersion: 2, session })
  }
  await test.database.put('meta', initialSummaryState(false), 'summaries')
  expect((await test.runtime.repository.maintainSummaries()).ok).toBe(true)

  await records.load({ tab: 'history', variant: 'classic' })
  const firstIds = records.rows.map((row) => row.id)
  for (let page = 2; page <= 5; page++) {
    await records.changePage('next')
    expect(records.rows.length).toBeLessThanOrEqual(30)
    expect(records.pageNumber).toBe(page)
  }
  expect(records.rows).toHaveLength(15)
  expect(records.nextCursor).toBeNull()

  for (let page = 4; page >= 1; page--) {
    await records.changePage('previous')
    expect(records.pageNumber).toBe(page)
  }
  expect(records.rows.map((row) => row.id)).toEqual(firstIds)

  await test.runtime.repository.clearAll()
  await records.changePage('next')

  expect(records.pageNumber).toBe(1)
  expect(records.rows).toEqual([])
  expect(records.loaded).toBe(true)
  records.dispose()
  test.dispose()
})

it('keeps pending legacy coverage explicit and repairs it through the real maintenance path', async () => {
  const test = await createTestRuntime()
  const records = test.app.runWithContext(() => useRecordsStore(test.pinia))
  await test.database.put('sessions', { formatVersion: 2, revision: 1, session: makeSession() })
  await test.database.put('meta', initialSummaryState(false), 'summaries')

  await records.load({ tab: 'saves', variant: 'classic' })

  expect(records.pending).toBe(true)
  expect(records.loaded).toBe(false)
  expect(records.rows).toEqual([])

  await records.retry()

  expect(records.pending).toBe(false)
  expect(records.loaded).toBe(true)
  expect(records.rows.map((row) => row.id)).toEqual(['fixture-free-session'])
  records.dispose()
  test.dispose()
})

it('retains a compatible overview while refreshing and discards late results after changing filter', async () => {
  const test = await createTestRuntime()
  const records = test.app.runWithContext(() => useRecordsStore(test.pinia))
  await records.load({ tab: 'overview', variant: 'classic' })
  const original = records.summary
  const pending = deferred<Awaited<ReturnType<typeof test.runtime.repository.readOverview>>>()
  const response = await test.runtime.repository.readOverview('classic', records.today)
  const read = vi
    .spyOn(test.runtime.repository, 'readOverview')
    .mockReturnValueOnce(pending.promise)

  const refreshing = records.load()

  expect(records.summary).toEqual(original)
  expect(records.loaded).toBe(true)
  await records.load({ tab: 'saves', variant: 'arrow' })
  pending.resolve(response)
  await refreshing

  expect(records.summary).toBeNull()
  expect(records.rows).toEqual([])
  expect(records.loaded).toBe(true)
  read.mockRestore()
  records.dispose()
  test.dispose()
})

it('waits for computation before validating a requested backup preview', async () => {
  const test = await createTestRuntime()
  const records = test.app.runWithContext(() => useRecordsStore(test.pinia))
  const pending = deferred<void>()
  const readiness = vi.spyOn(test.runtime, 'ensureEngine').mockReturnValue(
    pending.promise.then(() => {
      throw new Error('Injected engine load failure')
    }),
  )

  const preview = records.previewRestore('{}')

  expect(readiness).toHaveBeenCalledOnce()
  expect(records.busy).toBe(true)
  expect(records.backupError).toBeNull()
  expect(records.backupPreview).toBeNull()
  pending.resolve()
  await preview

  expect(records.backupError).toContain('校验暂时无法完成')
  expect(records.busy).toBe(false)
  records.dispose()
  test.dispose()
})

it('keeps backup busy while a concurrent view refresh completes', async () => {
  const test = await createTestRuntime()
  const records = test.app.runWithContext(() => useRecordsStore(test.pinia))
  const pending = deferred<void>()
  vi.spyOn(test.runtime, 'ensureEngine').mockReturnValueOnce(pending.promise)

  const preview = records.previewRestore('{}')
  await records.load({ tab: 'overview', variant: 'classic' })

  expect(records.busy).toBe(true)
  pending.resolve()
  await preview
  expect(records.busy).toBe(false)
  expect(records.backupError).toContain('备份文件无效')
  records.dispose()
  test.dispose()
})

it('releases only its own view reader and cancels late detail publication', async () => {
  const test = await createTestRuntime()
  const records = test.app.runWithContext(() => useRecordsStore(test.pinia))
  const firstReader = Symbol('first')
  const secondReader = Symbol('second')
  const pending = deferred<Awaited<ReturnType<typeof test.runtime.repository.readResult>>>()
  vi.spyOn(test.runtime.repository, 'readResult').mockReturnValueOnce(pending.promise)

  const loading = records.loadResult('missing', firstReader)
  await records.load({ tab: 'overview', variant: 'classic' }, secondReader)
  records.releaseReader(firstReader)

  expect(records.loaded).toBe(true)
  expect(records.summary).not.toBeNull()
  records.releaseReader(secondReader)
  pending.resolve({ ok: true, value: null })
  await loading

  expect(records.loaded).toBe(false)
  expect(records.summary).toBeNull()
  expect(records.result).toBeNull()
  expect(records.busy).toBe(false)
  records.dispose()
  test.dispose()
})

it('publishes the empty overview after clearing the selected dataset', async () => {
  const test = await createTestRuntime()
  const records = test.app.runWithContext(() => useRecordsStore(test.pinia))
  await records.load({ tab: 'overview', variant: 'arrow' })

  await records.clearLocalData()

  expect(records.loaded).toBe(true)
  expect(records.completedCount).toBe(0)
  expect(records.summary).toMatchObject({ currentStreak: 0, longestStreak: 0 })
  records.dispose()
  test.dispose()
})

it('does not roll an older page number into a new failing variant query', async () => {
  const test = await createTestRuntime()
  const records = test.app.runWithContext(() => useRecordsStore(test.pinia))
  for (let index = 0; index < 65; index++) {
    const session = makeSession({ id: `saved-${String(index).padStart(3, '0')}` })
    await test.database.put('sessions', { formatVersion: 2, revision: 1, session })
  }
  await test.database.put('meta', initialSummaryState(false), 'summaries')
  expect((await test.runtime.repository.maintainSummaries()).ok).toBe(true)
  await records.load({ tab: 'saves', variant: 'classic' })
  await records.changePage('next')
  const thirdPage = await test.runtime.repository.readSummaryPage({
    kind: 'sessions',
    variant: 'classic',
    cursor: records.nextCursor,
  })
  const pending = deferred<typeof thirdPage>()
  vi.spyOn(test.runtime.repository, 'readSummaryPage')
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce({
      ok: false,
      error: { kind: 'unavailable', message: 'Injected failure' },
    })

  const paging = records.changePage('next')
  await records.load({ tab: 'saves', variant: 'arrow' })
  pending.resolve(thirdPage)
  await paging

  expect(records.error).toContain('读取失败')
  expect(records.pageNumber).toBe(1)
  expect(records.rows).toEqual([])
  records.dispose()
  test.dispose()
})
