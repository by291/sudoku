import 'fake-indexeddb/auto'
import { afterEach, expect, it } from 'vitest'
import { openSudokuDatabase } from '@/storage/database'
import { createOwnershipCoordinator } from '@/infrastructure/ownership'
import { createGameRepository } from '@/storage/repository'
import { makeSession } from '../../tests/support/gameFixtures'
import { createSaveQueue } from '@/storage/saveQueue'

const databases: Awaited<ReturnType<typeof openSudokuDatabase>>[] = []
afterEach(() => {
  for (const database of databases.splice(0)) database.close()
})
async function setup() {
  const database = await openSudokuDatabase(crypto.randomUUID())
  databases.push(database)
  let now = 1000
  const provider = () => Promise.resolve(database)
  return {
    database,
    provider,
    now: () => now,
    advance: (milliseconds: number) => {
      now += milliseconds
    },
  }
}
it('allows one editor and rejects expired fences without relying on messages', async () => {
  const clock = await setup()
  const first = createOwnershipCoordinator(clock.provider, { now: clock.now, channel: null })
  const second = createOwnershipCoordinator(clock.provider, { now: clock.now, channel: null })
  const [a, b] = await Promise.all([
    first.acquireOwnership('game', 'a'),
    second.acquireOwnership('game', 'b'),
  ])
  expect(a.ok && a.value).toBeTruthy()
  expect(b).toEqual({ ok: true, value: null })
  if (!a.ok || !a.value) throw new Error('Expected first owner')
  clock.advance(6000)
  const takeover = await second.acquireOwnership('game', 'b')
  if (!takeover.ok || !takeover.value) throw new Error('Expected takeover')
  expect(takeover.value.fence).toBeGreaterThan(a.value.fence)
  expect(await first.renewOwnership(a.value)).toEqual({ ok: true, value: false })
  const repository = createGameRepository(clock.provider, { now: clock.now })
  expect(await repository.writeSession({ ...makeSession(), id: 'game' }, 0, a.value)).toMatchObject(
    { ok: false, error: { kind: 'ownership-lost' } },
  )
  await second.releaseOwnership(takeover.value)
  const reacquired = await first.acquireOwnership('game', 'a')
  expect(reacquired.ok && reacquired.value?.fence).toBe(takeover.value.fence + 1)
  first.dispose()
  second.dispose()
})
it('retains a single mode slot and invalidates writers after data reset', async () => {
  const clock = await setup()
  const owner = createOwnershipCoordinator(clock.provider, { now: clock.now, channel: null })
  const repository = createGameRepository(clock.provider, { now: clock.now })
  const session = { ...makeSession(), id: 'first' }
  const other = { ...makeSession(), id: 'second' }
  const a = await owner.acquireOwnership(session.id, 'a')
  const b = await owner.acquireOwnership(other.id, 'b')
  if (!a.ok || !a.value || !b.ok || !b.value) throw new Error('Expected tokens')
  expect(await repository.replaceActiveSession(session, a.value, null)).toMatchObject({
    ok: true,
    value: { revision: 1 },
  })
  expect(await repository.replaceActiveSession(other, b.value, null)).toMatchObject({
    ok: false,
    error: { kind: 'revision-conflict' },
  })
  expect(
    await repository.replaceActiveSession(other, b.value, {
      id: session.id,
      revision: 1,
      token: a.value,
    }),
  ).toMatchObject({ ok: true })
  expect(await repository.listSessions()).toMatchObject({
    ok: true,
    value: [{ session: { id: 'second' } }],
  })
  await repository.clearAll()
  expect(await repository.writeSession(other, 1, b.value)).toMatchObject({
    ok: false,
    error: { kind: 'ownership-lost' },
  })
  expect(await repository.listSessions()).toEqual({ ok: true, value: [] })
  owner.dispose()
})
it('notifies peers about ownership and reset', async () => {
  const clock = await setup()
  const name = crypto.randomUUID()
  const first = createOwnershipCoordinator(clock.provider, { channel: new BroadcastChannel(name) })
  const second = createOwnershipCoordinator(clock.provider, { channel: new BroadcastChannel(name) })
  const ownership = new Promise<unknown>((resolve) => second.subscribe(resolve))
  await first.acquireOwnership('broadcast-game', 'a')
  expect(await ownership).toEqual({ kind: 'ownership', sessionId: 'broadcast-game' })
  const reset = new Promise<unknown>((resolve) => second.subscribe(resolve))
  first.notifyReset()
  expect(await reset).toMatchObject({ kind: 'reset' })
  first.dispose()
  second.dispose()
})
it('commits one result and rejects a queued snapshot after reset', async () => {
  const clock = await setup()
  const owner = createOwnershipCoordinator(clock.provider, { now: clock.now, channel: null })
  const repository = createGameRepository(clock.provider, { now: clock.now })
  const session = makeSession({ id: 'complete' })
  session.entries = session.puzzle.solution.map((digit, cell) =>
    session.puzzle.givens[cell] === 0 ? digit : 0,
  )
  session.completion = { elapsedMs: 0, completedAt: session.startedAt }
  const result = await owner.acquireOwnership(session.id, 'a')
  if (!result.ok || !result.value) throw new Error('Expected lease')
  await repository.writeSession(session, 0, result.value)
  await repository.writeSession(session, 1, result.value)
  expect(await clock.database.count('results')).toBe(1)
  let unblock: () => void = () => {
    throw new Error('Gate not ready')
  }
  const gate = new Promise<void>((resolve) => {
    unblock = resolve
  })
  const queue = createSaveQueue(
    {
      async writeSession(...args) {
        await gate
        return repository.writeSession(...args)
      },
    },
    result.value,
    2,
  )
  const pending = queue.enqueue(session)
  await repository.clearAll()
  unblock()
  expect(await pending).toMatchObject({ ok: false, error: { kind: 'ownership-lost' } })
  expect(await clock.database.count('sessions')).toBe(0)
  expect(await clock.database.count('results')).toBe(0)
  queue.dispose()
  owner.dispose()
})
