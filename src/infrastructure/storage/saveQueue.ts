import type { GameSession } from '../../features/game/session'
import type { OwnershipToken } from '../ownership'
import type { GameRepository } from './repository'
import type { SessionRecord, StorageOutcome } from './records'
export interface SaveQueue {
  enqueue(session: GameSession): Promise<StorageOutcome<SessionRecord>>
  flush(): Promise<StorageOutcome<void>>
  retry(): Promise<StorageOutcome<void>>
  dispose(): void
  readonly revision: number
}
export function createSaveQueue(
  repository: Pick<GameRepository, 'writeSession'>,
  token: OwnershipToken,
  initialRevision: number,
): SaveQueue {
  let revision = initialRevision
  let disposed = false
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
      if (disposed) return failure()
      if (last && !last.ok) return last
      last = await repository.writeSession(snapshot, revision, token)
      if (last.ok) revision = last.value.revision
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
      if (disposed) return failure()
      if (
        last &&
        !last.ok &&
        (last.error.kind === 'ownership-lost' || last.error.kind === 'revision-conflict')
      )
        return last
      if (latest) {
        last = null
        await enqueue(latest)
      }
      return flush()
    },
    dispose() {
      disposed = true
    },
    get revision() {
      return revision
    },
  }
}
