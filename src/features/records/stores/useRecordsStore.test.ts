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
import { createGenerationInput } from '@/core/sudoku/generation'

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
  const generating = game.startGame(createGenerationInput('classic', 'easy', 'late-backup'), {
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
  await records.restoreBackup()
  pending.resolve({
    status: 'completed',
    value: makeSession().puzzle,
    assessment: { status: 'unavailable', reason: 'invalid-summary', issues: [] },
  })
  await generating

  expect(game.session).toBeNull()
  expect(preferences.settings.theme).toBe('dark')
  expect(records.sessions).toHaveLength(1)
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
  await records.load()

  expect(records.sessions).toHaveLength(1)
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
  await records.load()
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
  expect(records.sessions).toHaveLength(1)
  expect(preferences.settings.theme).toBe('dark')
  expect(await test.database.count('sessions')).toBe(1)
  records.dispose()
  test.dispose()
})
