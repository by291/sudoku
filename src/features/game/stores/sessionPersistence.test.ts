import { afterEach, expect, it, vi } from 'vitest'
import { createSessionPersistence } from '@/features/game/stores/sessionPersistence'
import { createTestRuntime } from '../../../../tests/support/runtime'
import { makeSession } from '../../../../tests/support/gameFixtures'
import { deferred } from '../../../../tests/support/deferred'
import type { StorageOutcome, SessionRecord } from '@/storage/records'

const runtimes: Awaited<ReturnType<typeof createTestRuntime>>[] = []

afterEach(() => {
  for (const runtime of runtimes.splice(0)) {
    runtime.dispose()
  }
})

it('shares one flush and lease release across concurrent release calls', async () => {
  const test = await createTestRuntime()
  runtimes.push(test)
  const session = makeSession()
  const acquired = await test.runtime.ownership.acquireOwnership(session.id, test.runtime.ownerId)
  if (!acquired.ok || !acquired.value) {
    throw new Error('Could not acquire fixture ownership')
  }

  const release = vi.spyOn(test.runtime.ownership, 'releaseOwnership')
  const persistence = createSessionPersistence(test.runtime)
  persistence.attach(session.id, acquired.value, 0)
  await persistence.save(session)

  const first = persistence.release()
  const second = persistence.release()

  expect(second).toBe(first)
  await Promise.all([first, second])

  expect(release).toHaveBeenCalledExactlyOnceWith(acquired.value)
})

it('does not clear a new attachment dirty state when an old save finishes', async () => {
  const test = await createTestRuntime()
  runtimes.push(test)
  const session = makeSession()
  const acquired = await test.runtime.ownership.acquireOwnership(session.id, test.runtime.ownerId)
  if (!acquired.ok || !acquired.value) {
    throw new Error('Could not acquire fixture ownership')
  }

  const pending = deferred<StorageOutcome<SessionRecord>>()
  const entered = deferred<void>()
  test.runtime.repository.writeSession = async () => {
    entered.resolve()

    return pending.promise
  }
  const persistence = createSessionPersistence(test.runtime)
  persistence.attach(session.id, acquired.value, 0)
  const saving = persistence.save(session)
  await entered.promise

  persistence.attach('new-session', null, 0)
  persistence.markDirty()
  pending.resolve({ ok: true, value: { formatVersion: 2, revision: 1, session } })
  await saving

  expect(persistence.capture()).toMatchObject({
    sessionId: 'new-session',
    revision: 0,
    dirty: true,
  })
})

it('reports a completed queued save while the same attachment is releasing', async () => {
  const test = await createTestRuntime()
  runtimes.push(test)
  const session = makeSession()
  const acquired = await test.runtime.ownership.acquireOwnership(session.id, test.runtime.ownerId)
  if (!acquired.ok || !acquired.value) {
    throw new Error('Could not acquire fixture ownership')
  }
  const gate = deferred<StorageOutcome<SessionRecord>>()
  const entered = deferred<void>()
  test.runtime.repository.writeSession = async () => {
    entered.resolve()
    return gate.promise
  }
  const persistence = createSessionPersistence(test.runtime)
  persistence.attach(session.id, acquired.value, 0)
  const saving = persistence.save(session)
  await entered.promise

  const releasing = persistence.release()
  gate.resolve({ ok: true, value: { formatVersion: 2, revision: 1, session } })
  await Promise.all([saving, releasing])

  expect(persistence.saveState.value).toBe('saved')
  expect(persistence.capture().revision).toBe(1)
})
