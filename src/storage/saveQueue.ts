import type { GameSession } from '@/features/game/model/session'
import type { OwnershipToken } from '@/storage/ownership'
import type { GameRepository } from '@/storage/repository'
import type { SessionRecord, StorageOutcome } from '@/storage/records'

export interface SaveQueue {
  enqueue(session: GameSession): Promise<StorageOutcome<SessionRecord>>
  flush(): Promise<StorageOutcome<void>>
  retry(): Promise<StorageOutcome<void>>
  dispose(): void
  readonly revision: number
}

/** Serializes owned session snapshots against the lease and last committed revision. */
export function createSaveQueue(
  repository: Pick<GameRepository, 'writeSession'>,
  token: OwnershipToken,
  initialRevision: number,
): SaveQueue {
  let revision = initialRevision
  let isDisposed = false
  let latest: GameSession | null = null
  let last: StorageOutcome<SessionRecord> | null = null
  let tail: Promise<void> = Promise.resolve()
  const failure = (): Extract<StorageOutcome<never>, { ok: false }> => ({
    ok: false,
    error: { kind: 'ownership-lost', message: 'Save queue disposed' },
  })

  function enqueue(session: GameSession): Promise<StorageOutcome<SessionRecord>> {
    // Snapshot synchronously: a later edit must never alter an already queued write.
    const snapshot = structuredClone(session)
    latest = snapshot

    const work = tail.then(async () => {
      if (isDisposed) {
        return failure()
      }

      // Later writes must wait until a failed revision has been retried or discarded.
      if (last && !last.ok) {
        return last
      }

      last = await repository.writeSession(snapshot, revision, token)
      if (last.ok) {
        revision = last.value.revision
      }

      return last
    })
    tail = work.then(() => undefined)

    return work
  }

  async function flush(): Promise<StorageOutcome<void>> {
    await tail

    return last && !last.ok ? last : { ok: true, value: undefined }
  }

  return {
    enqueue,
    flush,
    async retry() {
      await tail
      if (isDisposed) {
        return failure()
      }

      if (
        last &&
        !last.ok &&
        (last.error.kind === 'ownership-lost' || last.error.kind === 'revision-conflict')
      ) {
        return last
      }

      // Intermediate snapshots are superseded by the latest edits at the same revision.
      if (latest) {
        last = null
        await enqueue(latest)
      }

      return flush()
    },
    dispose() {
      isDisposed = true
    },
    get revision() {
      return revision
    },
  }
}
