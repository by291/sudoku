import { ref } from 'vue'
import type { GameRuntime } from '@/runtime'
import type { OwnershipToken } from '@/storage/ownership'
import type { SaveQueue } from '@/storage/saveQueue'
import type { SessionRecord, StorageOutcome } from '@/storage/records'
import type { GameSession } from '@/features/game/model/session'

export type PersistenceCheckpoint = {
  readonly sessionId: string | null
  readonly token: OwnershipToken | null
  readonly revision: number
  readonly dirty: boolean
  /** Attachment identity survives writes; revisions advance within that same attachment. */
  readonly attachment: number
}

export function createSessionPersistence(
  runtime: Pick<GameRuntime, 'ownership' | 'repository' | 'createSaveQueue' | 'ownerId'>,
) {
  const saveState = ref<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const saveMessage = ref<string | null>(null)
  let sessionId: string | null = null
  let token: OwnershipToken | null = null
  let queue: SaveQueue | null = null
  let revision = 0
  let dirty = false
  let attachment = 0
  let saveGeneration = 0
  let releasing: Promise<StorageOutcome<void>> | null = null

  function capture(): PersistenceCheckpoint {
    return { sessionId, token, revision, dirty, attachment }
  }

  function isCurrent(checkpoint: PersistenceCheckpoint): boolean {
    // Reattaching the same session invalidates old continuations; saving a newer revision does not.
    return checkpoint.sessionId === sessionId && checkpoint.attachment === attachment
  }

  function report(result: StorageOutcome<unknown>) {
    if (result.ok) {
      saveState.value = 'saved'
      saveMessage.value = null

      return
    }

    const lost = result.error.kind === 'ownership-lost' || result.error.kind === 'revision-conflict'
    saveState.value = 'failed'
    saveMessage.value = lost
      ? '编辑权或存档已变化，请重新载入后继续。'
      : '保存失败，本局暂存在内存中。请保持页面打开并重试保存。'
  }

  function attach(id: string, nextToken: OwnershipToken | null, nextRevision: number) {
    attachment++
    saveGeneration++
    queue?.dispose()
    sessionId = id
    token = nextToken
    revision = nextRevision
    dirty = false
    queue = nextToken ? runtime.createSaveQueue(nextToken, revision) : null
  }

  function unavailable(): StorageOutcome<never> {
    saveState.value = 'failed'
    saveMessage.value = '当前仅在内存中游玩，尚未保存。请保持页面打开并重试保存。'

    return { ok: false, error: { kind: 'unavailable', message: 'No attached save queue' } }
  }

  async function save(snapshot: GameSession): Promise<StorageOutcome<SessionRecord>> {
    if (!queue || snapshot.id !== sessionId) {
      return unavailable()
    }

    const checkpoint = capture()
    const generation = ++saveGeneration
    const currentQueue = queue
    saveState.value = 'saving'
    // enqueue snapshots synchronously, before a later input can mutate the next write.
    const result = await currentQueue.enqueue(snapshot)

    // release detaches the queue before flushing; its final write still belongs to this attachment.
    if (isCurrent(checkpoint) && generation === saveGeneration) {
      if (result.ok) {
        revision = result.value.revision
        dirty = false
      }

      report(result)
    }

    return result
  }

  async function flush(): Promise<StorageOutcome<void>> {
    const currentQueue = queue
    const checkpoint = capture()

    if (!currentQueue) {
      return { ok: true, value: undefined }
    }

    const result = await currentQueue.flush()

    if (isCurrent(checkpoint) && queue === currentQueue) {
      revision = currentQueue.revision
      if (!result.ok) {
        dirty = true
        report(result)
      }
    }

    return result
  }

  async function retry(snapshot: GameSession): Promise<StorageOutcome<void>> {
    const currentQueue = queue
    const checkpoint = capture()

    if (!currentQueue) {
      return unavailable()
    }

    if (dirty) {
      await save(snapshot)
      if (!isCurrent(checkpoint) || queue !== currentQueue) {
        return {
          ok: false,
          error: { kind: 'ownership-lost', message: 'Session changed during retry' },
        }
      }

      if (saveState.value === 'saved') {
        return { ok: true, value: undefined }
      }
    }

    saveState.value = 'saving'
    const result = await currentQueue.retry()

    if (isCurrent(checkpoint) && queue === currentQueue) {
      if (result.ok) {
        revision = currentQueue.revision
        dirty = false
      }

      report(result)
    }

    return result
  }

  function release(): Promise<StorageOutcome<void>> {
    if (releasing) {
      return releasing
    }

    const checkpoint = capture()
    const oldQueue = queue
    const oldToken = token
    queue = null
    token = null

    const work = (async (): Promise<StorageOutcome<void>> => {
      const flushed = oldQueue ? await oldQueue.flush() : { ok: true as const, value: undefined }

      // A release may finish after reset or installation; it must never update the new owner.
      if (isCurrent(checkpoint) && !queue && oldQueue) {
        revision = oldQueue.revision
        if (!flushed.ok) {
          dirty = true
          report(flushed)
        }
      }

      oldQueue?.dispose()
      if (oldToken) {
        await runtime.ownership.releaseOwnership(oldToken)
      }

      return flushed
    })()

    releasing = work
    void work.finally(() => {
      if (releasing === work) {
        releasing = null
      }
    })

    return work
  }

  async function renew(): Promise<StorageOutcome<boolean>> {
    const currentToken = token

    if (!currentToken) {
      return { ok: true, value: true }
    }

    const result = await runtime.ownership.renewOwnership(currentToken)

    return token === currentToken ? result : { ok: true, value: true }
  }

  function reset() {
    attachment++
    saveGeneration++
    queue?.dispose()
    queue = null
    token = null
    sessionId = null
    revision = 0
    dirty = false
    saveState.value = 'idle'
    saveMessage.value = null
  }

  return {
    saveState,
    saveMessage,
    attach,
    capture,
    isCurrent,
    save,
    flush,
    retry,
    release,
    renew,
    reset,
    report,
    markDirty() {
      dirty = true
    },
    waitForRelease: async () => {
      if (releasing) {
        await releasing
      }
    },
    get hasQueue() {
      return queue !== null
    },
  }
}

export type SessionPersistence = ReturnType<typeof createSessionPersistence>
