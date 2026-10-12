import { expect, it, vi } from 'vitest'
import { unwrap } from 'idb'
import { createTestRuntime } from '../../../../tests/support/runtime'
import { makeSession } from '../../../../tests/support/gameFixtures'
import { useRecordsStore } from '@/features/records/stores/useRecordsStore'
import { usePreferencesStore } from '@/features/settings/stores/usePreferencesStore'
import { useGameStore } from '@/features/game/stores/useGameStore'
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
  ] as const)
    expect(await test.database.count(store)).toBe(0)
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
  const raw = unwrap(test.database),
    original = raw.transaction.bind(raw)
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
