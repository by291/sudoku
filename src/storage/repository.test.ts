import 'fake-indexeddb/auto'
import { afterEach, expect, it, vi } from 'vitest'
import { deleteDB, unwrap } from 'idb'
import { openSudokuDatabase } from '@/storage/database'
import { createGameRepository } from '@/storage/repository'
import { makeSession } from '../../tests/support/gameFixtures'
import { deferred } from '../../tests/support/deferred'

const databases: { name: string; close: () => void }[] = []
async function setup() {
  const name = crypto.randomUUID(),
    database = await openSudokuDatabase(name)
  databases.push({ name, close: () => database.close() })
  return { database, repository: createGameRepository(() => Promise.resolve(database)) }
}
afterEach(async () => {
  for (const database of databases.splice(0)) {
    database.close()
    await deleteDB(database.name)
  }
})
it('upgrades an empty database and round-trips settings and progress', async () => {
  const { database, repository } = await setup()
  expect(database.objectStoreNames.contains('sessions')).toBe(true)
  const settings = {
    theme: 'dark',
    showTimer: false,
    highlightConflicts: true,
    currentLessonId: null,
  } as const
  expect(await repository.writeSettings(settings, 1)).toEqual({ ok: true, value: undefined })
  expect(await repository.readSettings()).toEqual({ ok: true, value: settings })
  const progress = { lessonId: 'rules', completedAt: '2026-10-11T01:00:00.000Z' }
  await repository.writeLessonProgress(progress, 1)
  expect(await repository.readLessonProgress()).toEqual({ ok: true, value: [progress] })
})
it('isolates corrupt records and preserves valid saves during cleanup', async () => {
  const { database, repository } = await setup()
  expect(database.objectStoreNames.contains('sessions')).toBe(true)
  const valid = { formatVersion: 1, revision: 0, session: makeSession() }
  await database.put('sessions', valid)
  await database.put('sessions', {
    ...valid,
    session: { ...valid.session, id: 'corrupt', notes: [512] },
  })
  expect(await repository.listSessions()).toEqual({ ok: true, value: [valid] })
  expect(await database.count('quarantine')).toBe(1)
  expect(await repository.countQuarantined()).toEqual({ ok: true, value: 1 })
  await repository.removeQuarantined()
  expect(await database.count('quarantine')).toBe(0)
  expect(await database.count('sessions')).toBe(1)
})
it('returns an explicit failure when IndexedDB cannot open', async () => {
  const repository = createGameRepository(() => Promise.reject(new Error('Storage blocked')))
  expect(await repository.listSessions()).toMatchObject({
    ok: false,
    error: { kind: 'unavailable' },
  })
})
it('does not claim write success after its connection has closed', async () => {
  const { database, repository } = await setup()
  database.close()
  const result = await repository.writeSettings(
    {
      theme: 'light',
      showTimer: true,
      highlightConflicts: true,
      currentLessonId: null,
    },
    1,
  )
  expect(result).toMatchObject({ ok: false, error: { kind: 'write-failed' } })
})

it('reports an aborted transaction without committing preferences or leaking a rejection', async () => {
  const { database, repository } = await setup()
  const raw = unwrap(database)
  const original = raw.transaction.bind(raw)
  const spy = vi.spyOn(raw, 'transaction').mockImplementation((stores, mode, options) => {
    const transaction = original(stores, mode, options)
    queueMicrotask(() => transaction.abort())
    return transaction
  })
  const result = await repository.writeSettings(
    {
      theme: 'dark',
      showTimer: true,
      highlightConflicts: true,
      currentLessonId: null,
    },
    1,
  )
  spy.mockRestore()
  expect(result).toMatchObject({ ok: false, error: { kind: 'write-failed' } })
  expect(await database.get('settings', 'preferences')).toBeUndefined()
})
for (const store of ['settings', 'lessons'] as const) {
  it(`fences a delayed ${store} write against a concurrent clear-all`, async () => {
    const { database, repository } = await setup()
    const gate = deferred<void>(),
      entered = deferred<void>()
    const otherTab = createGameRepository(async () => {
      entered.resolve()
      await gate.promise
      return database
    })
    const pending =
      store === 'settings'
        ? otherTab.writeSettings(
            { theme: 'dark', showTimer: true, highlightConflicts: true, currentLessonId: 'rules' },
            1,
          )
        : otherTab.writeLessonProgress(
            { lessonId: 'rules', completedAt: '2026-10-11T01:00:00.000Z' },
            1,
          )
    await entered.promise
    expect(await repository.clearAll()).toEqual({ ok: true, value: undefined })
    gate.resolve()
    expect(await pending).toMatchObject({ ok: false, error: { kind: 'revision-conflict' } })
    expect(await database.count(store)).toBe(0)
  })
}
