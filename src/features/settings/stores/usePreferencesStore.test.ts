import { expect, it, vi } from 'vitest'
import { createTestRuntime } from '../../../../tests/support/runtime'
import { usePreferencesStore } from '@/features/settings/stores/usePreferencesStore'
import { DEFAULT_SETTINGS } from '@/features/settings/model/preferences'
import { deferred } from '../../../../tests/support/deferred'

it('does not adopt a restored epoch when retrying stale preferences without a reset notification', async () => {
  const test = await createTestRuntime()
  const preferences = test.app.runWithContext(() => usePreferencesStore(test.pinia))
  await preferences.update({ showTimer: false, lessonStages: { 'killer-combined': 2 } })
  const restored = {
    ...DEFAULT_SETTINGS,
    theme: 'dark',
    lessonStages: { 'killer-combined': 4 },
  } as const
  await test.runtime.repository.restoreBackup(
    JSON.stringify({
      backupVersion: 1,
      exportedAt: '2026-10-14T03:00:00.000Z',
      sessions: [],
      results: [],
      lessons: [],
      settings: restored,
    }),
    1,
  )

  expect(await preferences.update({ theme: 'light' })).toBe(false)
  expect(await preferences.update({})).toBe(false)
  expect(await test.runtime.repository.readSettings()).toEqual({ ok: true, value: restored })

  await preferences.retry()
  expect(preferences.settings).toEqual(restored)
  expect(await preferences.update({ theme: 'light' })).toBe(true)
  expect(await test.runtime.repository.readSettings()).toEqual({
    ok: true,
    value: { ...restored, theme: 'light' },
  })
  test.dispose()
})

it('reads committed settings before applying a first patch with an unknown initial epoch', async () => {
  const test = await createTestRuntime()
  const restored = { ...DEFAULT_SETTINGS, lessonStages: { 'killer-combined': 4 }, showTimer: false }
  await test.runtime.repository.writeSettings(restored, 1)
  const preferences = test.app.runWithContext(() => usePreferencesStore(test.pinia))

  expect(await preferences.update({ theme: 'dark' })).toBe(true)
  expect(await test.runtime.repository.readSettings()).toEqual({
    ok: true,
    value: { ...restored, theme: 'dark' },
  })
  test.dispose()
})

it('coalesces explicit initial patches while preserving unread committed progress', async () => {
  const test = await createTestRuntime()
  const restored = { ...DEFAULT_SETTINGS, lessonStages: { 'killer-combined': 4 } }
  await test.runtime.repository.writeSettings(restored, 1)
  const preferences = test.app.runWithContext(() => usePreferencesStore(test.pinia))

  const theme = preferences.update({ theme: 'dark' })
  const timer = preferences.update({ showTimer: false })
  await Promise.all([theme, timer])

  expect(await test.runtime.repository.readSettings()).toEqual({
    ok: true,
    value: { ...restored, theme: 'dark', showTimer: false },
  })
  test.dispose()
})

it('ignores a stale settings conflict delivered after a reset and fresh read', async () => {
  const test = await createTestRuntime()
  const preferences = test.app.runWithContext(() => usePreferencesStore(test.pinia))
  await preferences.load()
  const gate = deferred<void>()
  const entered = deferred<void>()
  const original = test.runtime.repository.writeSettings
  const spy = vi
    .spyOn(test.runtime.repository, 'writeSettings')
    .mockImplementation(async (...args) => {
      entered.resolve()
      await gate.promise
      return original(...args)
    })
  const saving = preferences.update({ theme: 'light' })
  await entered.promise
  const restored = {
    ...DEFAULT_SETTINGS,
    theme: 'dark',
    lessonStages: { 'killer-combined': 4 },
  } as const
  await test.runtime.repository.restoreBackup(
    JSON.stringify({
      backupVersion: 1,
      exportedAt: '2026-10-14T03:00:00.000Z',
      sessions: [],
      results: [],
      lessons: [],
      settings: restored,
    }),
    1,
  )
  const resetting = preferences.reset()
  await preferences.load()

  gate.resolve()
  await saving
  await resetting
  spy.mockRestore()
  expect(preferences.settings).toEqual(restored)
  expect(preferences.error).toBeNull()
  expect(preferences.needsReload).toBe(false)
  expect(await preferences.update({ showTimer: false })).toBe(true)
  test.dispose()
})
