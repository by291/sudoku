import type { IDBPTransaction } from 'idb'
import { isRecord } from '@/sudoku/values'
import { commitTransaction } from '@/storage/database'
import type { DatabaseProvider, SudokuDatabase } from '@/storage/database'
import { isIdentifier, isNonnegativeInteger } from '@/storage/records'
import type { StorageOutcome } from '@/storage/records'

// IndexedDB leases fence every session write; broadcasts only notify other tabs.
export const LEASE_DURATION_MS = 6000
export const LEASE_RENEWAL_MS = 2000

export type OwnershipToken = { sessionId: string; ownerId: string; fence: number; epoch: number }

type Lease = OwnershipToken & { expiresAt: number }

export type OwnershipNotice =
  { kind: 'ownership'; sessionId: string } | { kind: 'reset'; epoch: number }

export interface OwnershipCoordinator {
  acquireOwnership(
    sessionId: string,
    ownerId: string,
  ): Promise<StorageOutcome<OwnershipToken | null>>
  renewOwnership(token: OwnershipToken): Promise<StorageOutcome<boolean>>
  releaseOwnership(token: OwnershipToken): Promise<StorageOutcome<void>>
  subscribe(listener: (notice: OwnershipNotice) => void): () => void
  notifyReset(): void
  dispose(): void
}

export class StorageConflict extends Error {
  constructor(
    readonly kind: 'ownership-lost' | 'revision-conflict',
    message: string,
  ) {
    super(message)
  }
}

function parseLease(value: unknown): Lease | null {
  if (
    !isRecord(value) ||
    !isIdentifier(value.sessionId) ||
    !isIdentifier(value.ownerId) ||
    !isNonnegativeInteger(value.fence) ||
    !isNonnegativeInteger(value.epoch) ||
    typeof value.expiresAt !== 'number' ||
    !Number.isFinite(value.expiresAt)
  ) {
    return null
  }

  return {
    sessionId: value.sessionId,
    ownerId: value.ownerId,
    fence: value.fence,
    epoch: value.epoch,
    expiresAt: value.expiresAt,
  }
}

type OwnershipTransaction = IDBPTransaction<
  SudokuDatabase,
  (
    | 'leases'
    | 'meta'
    | 'sessions'
    | 'results'
    | 'sessionSummaries'
    | 'resultSummaries'
    | 'quarantine'
  )[],
  'readwrite'
>

export async function assertOwnership(
  transaction: OwnershipTransaction,
  token: OwnershipToken,
  now: number,
): Promise<void> {
  const epoch = await transaction.objectStore('meta').get('epoch')
  const lease = parseLease(await transaction.objectStore('leases').get(token.sessionId))
  if (
    !lease ||
    epoch !== token.epoch ||
    lease.epoch !== token.epoch ||
    lease.fence !== token.fence ||
    lease.ownerId !== token.ownerId ||
    lease.expiresAt <= now
  ) {
    throw new StorageConflict('ownership-lost', 'The editing lease is no longer valid')
  }
}

export function createOwnershipCoordinator(
  database: DatabaseProvider,
  options: { now?: () => number; channel?: BroadcastChannel | null } = {},
): OwnershipCoordinator {
  const now = options.now ?? Date.now
  const channel =
    options.channel === undefined
      ? typeof BroadcastChannel === 'undefined'
        ? null
        : new BroadcastChannel('sudoku-local')
      : options.channel
  const listeners = new Set<(notice: OwnershipNotice) => void>()
  const receive = (event: MessageEvent<unknown>) => {
    const value = event.data
    if (!isRecord(value)) {
      return
    }

    const notice: OwnershipNotice | null =
      value.kind === 'ownership' && isIdentifier(value.sessionId)
        ? { kind: 'ownership', sessionId: value.sessionId }
        : value.kind === 'reset' && isNonnegativeInteger(value.epoch)
          ? { kind: 'reset', epoch: value.epoch }
          : null
    if (notice) {
      for (const listener of listeners) {
        listener(notice)
      }
    }
  }
  channel?.addEventListener('message', receive)
  const publish = (notice: OwnershipNotice) => channel?.postMessage(notice)

  async function access<T>(
    operation: (transaction: OwnershipTransaction) => Promise<T>,
  ): Promise<StorageOutcome<T>> {
    try {
      const db = await database()
      const transaction = db.transaction(['leases', 'meta'], 'readwrite')

      return { ok: true, value: await commitTransaction(transaction, () => operation(transaction)) }
    } catch (error) {
      return {
        ok: false,
        error: {
          kind: 'unavailable',
          message: error instanceof Error ? error.message : 'Lease storage unavailable',
        },
      }
    }
  }

  return {
    async acquireOwnership(sessionId, ownerId) {
      const outcome = await access(async (transaction) => {
        if (!isIdentifier(sessionId) || !isIdentifier(ownerId)) {
          throw new TypeError('Invalid lease identity')
        }

        const epoch = await transaction.objectStore('meta').get('epoch')
        if (!isNonnegativeInteger(epoch)) {
          throw new TypeError('Invalid dataset epoch')
        }

        const previous = parseLease(await transaction.objectStore('leases').get(sessionId))
        if (
          previous &&
          previous.epoch === epoch &&
          previous.expiresAt > now() &&
          previous.ownerId !== ownerId
        ) {
          return null
        }

        const fence =
          previous && previous.epoch === epoch
            ? previous.ownerId === ownerId && previous.expiresAt > now()
              ? previous.fence
              : previous.fence + 1
            : 1
        const token = { sessionId, ownerId, fence, epoch }
        await transaction
          .objectStore('leases')
          .put({ ...token, expiresAt: now() + LEASE_DURATION_MS }, sessionId)

        return token
      })
      if (outcome.ok && outcome.value) {
        publish({ kind: 'ownership', sessionId })
      }

      return outcome
    },
    async renewOwnership(token) {
      return access(async (transaction) => {
        try {
          await assertOwnership(transaction, token, now())
        } catch (error) {
          if (error instanceof StorageConflict) {
            return false
          }

          throw error
        }
        await transaction
          .objectStore('leases')
          .put({ ...token, expiresAt: now() + LEASE_DURATION_MS }, token.sessionId)

        return true
      })
    },
    async releaseOwnership(token) {
      const outcome = await access(async (transaction) => {
        const lease = parseLease(await transaction.objectStore('leases').get(token.sessionId))
        if (
          lease &&
          lease.epoch === token.epoch &&
          lease.ownerId === token.ownerId &&
          lease.fence === token.fence
        ) {
          await transaction.objectStore('leases').put({ ...lease, expiresAt: 0 }, token.sessionId)
        }
      })
      publish({ kind: 'ownership', sessionId: token.sessionId })

      return outcome
    },
    subscribe(listener) {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    notifyReset() {
      publish({ kind: 'reset', epoch: Date.now() })
    },
    dispose() {
      channel?.removeEventListener('message', receive)
      channel?.close()
      listeners.clear()
    },
  }
}
