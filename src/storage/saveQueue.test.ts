import { expect, it } from 'vitest'
import { createSaveQueue } from '@/storage/saveQueue'
import { makeSession } from '../../tests/support/gameFixtures'
import type { SessionRecord, StorageOutcome } from '@/storage/records'

it('copies snapshots and serializes revisions while retrying only the newest failed state', async () => {
  const writes: { revision: number; elapsed: number }[] = []
  let fail = false
  const writer = {
    async writeSession(
      session: ReturnType<typeof makeSession>,
      revision: number,
    ): Promise<StorageOutcome<SessionRecord>> {
      writes.push({ revision, elapsed: session.elapsedMs })
      await Promise.resolve()
      return fail
        ? { ok: false, error: { kind: 'write-failed', message: 'Aborted' } }
        : { ok: true, value: { formatVersion: 2, revision: revision + 1, session } }
    },
  }
  const queue = createSaveQueue(writer, { sessionId: 'game', ownerId: 'a', fence: 1, epoch: 1 }, 0)
  const session = makeSession()
  const first = queue.enqueue(session)
  session.elapsedMs = 10
  const second = queue.enqueue(session)
  await Promise.all([first, second])
  expect(writes).toEqual([
    { revision: 0, elapsed: 0 },
    { revision: 1, elapsed: 10 },
  ])
  fail = true
  expect(await queue.enqueue({ ...session, elapsedMs: 20 })).toMatchObject({ ok: false })
  expect(await queue.enqueue({ ...session, elapsedMs: 30 })).toMatchObject({ ok: false })
  fail = false
  expect(await queue.retry()).toEqual({ ok: true, value: undefined })
  expect(writes.at(-1)).toEqual({ revision: 2, elapsed: 30 })
  queue.dispose()
})
it('does not retry an ownership or revision conflict', async () => {
  let calls = 0
  const queue = createSaveQueue(
    {
      async writeSession(): Promise<StorageOutcome<SessionRecord>> {
        calls++
        return { ok: false, error: { kind: 'revision-conflict', message: 'Peer saved' } }
      },
    },
    { sessionId: 'game', ownerId: 'a', fence: 1, epoch: 1 },
    0,
  )
  await queue.enqueue(makeSession())
  expect(await queue.retry()).toMatchObject({ ok: false, error: { kind: 'revision-conflict' } })
  expect(calls).toBe(1)
})
