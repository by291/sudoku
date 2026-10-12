import type { IDBPDatabase, IDBPTransaction } from 'idb'
import type { SudokuDatabase } from '@/storage/database'
import { commitTransaction } from '@/storage/database'
import { assertOwnership, StorageConflict } from '@/infrastructure/ownership'
import type { OwnershipToken } from '@/infrastructure/ownership'
import type { GameSession } from '@/features/game/model/session'
import type { LessonProgress, ResultRecord, SessionRecord, StorageOutcome } from '@/storage/records'
import type { ParseResult } from '@/core/sudoku/types'
import {
  parseLessonProgress,
  parseResultRecord,
  parseSessionRecord,
  parseSettings,
  parseSession,
  isNonnegativeInteger,
} from '@/storage/records'
import type { Settings } from '@/features/settings/model/preferences'
import { DEFAULT_SETTINGS } from '@/features/settings/model/preferences'
export interface GameRepository {
  writeSession(
    session: GameSession,
    expectedRevision: number,
    token: OwnershipToken,
    signal?: AbortSignal,
  ): Promise<StorageOutcome<SessionRecord>>
  replaceActiveSession(
    session: GameSession,
    token: OwnershipToken,
    previous: { id: string; revision: number; token: OwnershipToken } | null,
    signal?: AbortSignal,
  ): Promise<StorageOutcome<SessionRecord>>
  clearAll(): Promise<StorageOutcome<void>>
  listSessions(): Promise<StorageOutcome<readonly SessionRecord[]>>
  listResults(): Promise<StorageOutcome<readonly ResultRecord[]>>
  readSettings(): Promise<StorageOutcome<Settings>>
  readLessonProgress(): Promise<StorageOutcome<readonly LessonProgress[]>>
  readDatasetEpoch(): Promise<StorageOutcome<number>>
  writeSettings(settings: Settings, expectedEpoch: number): Promise<StorageOutcome<void>>
  writeLessonProgress(
    progress: LessonProgress,
    expectedEpoch: number,
  ): Promise<StorageOutcome<void>>
  removeQuarantined(): Promise<StorageOutcome<void>>
  countQuarantined(): Promise<StorageOutcome<number>>
}
export type DatabaseProvider = () => Promise<IDBPDatabase<SudokuDatabase>>
function isMatchingPrevious(raw: unknown, previous: { id: string; revision: number }): boolean {
  const parsed = parseSessionRecord(raw)
  return (
    parsed.valid &&
    parsed.value.session.id === previous.id &&
    parsed.value.revision === previous.revision
  )
}
function assertActive(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Session creation cancelled', 'AbortError')
}
function belongsToSlot(candidate: GameSession, target: GameSession): boolean {
  return (
    candidate.mode === target.mode &&
    (target.mode !== 'free' || candidate.puzzle.rules.kind === target.puzzle.rules.kind)
  )
}
async function assertDatasetEpoch(
  transaction: IDBPTransaction<SudokuDatabase, ('meta' | 'settings' | 'lessons')[], 'readwrite'>,
  expectedEpoch: number,
) {
  // Every player-data write carries the epoch observed when its workflow began.
  const current = await transaction.objectStore('meta').get('epoch')
  if (!isNonnegativeInteger(expectedEpoch) || current !== expectedEpoch)
    throw new StorageConflict('revision-conflict', 'Local data was cleared during this operation')
}
export function storageError(
  error: unknown,
  kind: 'unavailable' | 'write-failed',
): StorageOutcome<never> {
  return {
    ok: false,
    error: { kind, message: error instanceof Error ? error.message : 'Storage operation failed' },
  }
}
export function createGameRepository(
  database: DatabaseProvider,
  options: { now?: () => number; onReset?: () => void } = {},
): GameRepository {
  async function access<T>(
    operation: (db: IDBPDatabase<SudokuDatabase>) => Promise<T>,
    write = false,
  ): Promise<StorageOutcome<T>> {
    let db: IDBPDatabase<SudokuDatabase>
    try {
      db = await database()
    } catch (error) {
      return storageError(error, 'unavailable')
    }
    try {
      return { ok: true, value: await operation(db) }
    } catch (error) {
      if (error instanceof StorageConflict)
        return { ok: false, error: { kind: error.kind, message: error.message } }
      return storageError(error, write ? 'write-failed' : 'unavailable')
    }
  }
  async function list<T>(
    store: 'sessions' | 'results' | 'lessons',
    parse: (value: unknown) => ParseResult<T>,
  ): Promise<StorageOutcome<readonly T[]>> {
    return access(async (db) => {
      const transaction = db.transaction([store, 'quarantine'], 'readwrite')
      return commitTransaction(transaction, async () => {
        const objectStore = transaction.objectStore(store)
        const records: T[] = []
        let cursor = await objectStore.openCursor()
        while (cursor) {
          const parsed = parse(cursor.value)
          if (parsed.valid) records.push(parsed.value)
          else {
            await transaction
              .objectStore('quarantine')
              .put(
                { store, key: cursor.primaryKey, value: cursor.value, issues: parsed.issues },
                `${store}:${String(cursor.primaryKey)}`,
              )
            await cursor.delete()
          }
          cursor = await cursor.continue()
        }
        return records
      })
    })
  }
  return {
    writeSession: (session, expectedRevision, token, signal) =>
      access(async (db) => {
        const parsed = parseSession(session)
        if (!parsed.valid || token.sessionId !== session.id)
          throw new TypeError('Invalid session snapshot')
        const transaction = db.transaction(['sessions', 'results', 'leases', 'meta'], 'readwrite')
        return commitTransaction(transaction, async () => {
          assertActive(signal)
          await assertOwnership(transaction, token, (options.now ?? Date.now)())
          const raw = await transaction.objectStore('sessions').get(session.id)
          const current = raw === undefined ? null : parseSessionRecord(raw)
          if (
            (raw !== undefined &&
              (!current?.valid || current.value.revision !== expectedRevision)) ||
            (raw === undefined && expectedRevision !== 0)
          )
            throw new StorageConflict('revision-conflict', 'The saved revision has changed')
          const record: SessionRecord = {
            formatVersion: 2,
            revision: expectedRevision + 1,
            session: parsed.value,
          }
          assertActive(signal)
          await transaction.objectStore('sessions').put(record)
          if (session.completion) {
            const results = transaction.objectStore('results')
            const existing = await results.get(session.id)
            if (existing === undefined)
              await results.put({ formatVersion: 2, session: parsed.value })
            else {
              // Upgrade the original result rather than replacing its first completion facts.
              const original = parseResultRecord(existing)
              if (original.valid) await results.put(original.value)
            }
          }
          assertActive(signal)
          return record
        })
      }, true),
    replaceActiveSession: (session, token, previous, signal) =>
      access(async (db) => {
        const parsed = parseSession(session)
        if (!parsed.valid || token.sessionId !== session.id || session.mode === 'daily')
          throw new TypeError('Invalid replacement')
        const transaction = db.transaction(['sessions', 'results', 'leases', 'meta'], 'readwrite')
        return commitTransaction(transaction, async () => {
          assertActive(signal)
          await assertOwnership(transaction, token, (options.now ?? Date.now)())
          const records = await transaction
            .objectStore('sessions')
            .index('by-mode')
            .getAll(session.mode)
          const slot = records.filter((raw) => {
            const current = parseSessionRecord(raw)
            if (!current.valid)
              throw new StorageConflict(
                'revision-conflict',
                'The active slot contains invalid data; reload saved games',
              )
            return belongsToSlot(current.value.session, session)
          })
          if (
            (await transaction.objectStore('sessions').get(session.id)) ||
            slot.length > 1 ||
            (slot.length === 1 && (!previous || !isMatchingPrevious(slot[0], previous)))
          )
            throw new StorageConflict('revision-conflict', 'The active game slot has changed')
          if (previous) {
            await assertOwnership(transaction, previous.token, (options.now ?? Date.now)())
            const raw = await transaction.objectStore('sessions').get(previous.id)
            const previousRecord = parseSessionRecord(raw)
            if (
              !isMatchingPrevious(raw, previous) ||
              !previousRecord.valid ||
              !belongsToSlot(previousRecord.value.session, session) ||
              previous.token.sessionId !== previous.id
            )
              throw new StorageConflict('revision-conflict', 'Previous session changed')
            assertActive(signal)
            await transaction.objectStore('sessions').delete(previous.id)
          }
          const record: SessionRecord = { formatVersion: 2, revision: 1, session: parsed.value }
          assertActive(signal)
          await transaction.objectStore('sessions').put(record)
          assertActive(signal)
          return record
        })
      }, true),
    clearAll: async () => {
      const result = await access(async (db) => {
        const transaction = db.transaction(
          ['sessions', 'results', 'lessons', 'settings', 'quarantine', 'leases', 'meta'],
          'readwrite',
        )
        await commitTransaction(transaction, async () => {
          const epoch = await transaction.objectStore('meta').get('epoch')
          if (typeof epoch !== 'number' || !Number.isSafeInteger(epoch))
            throw new TypeError('Invalid dataset epoch')
          for (const store of [
            'sessions',
            'results',
            'lessons',
            'settings',
            'quarantine',
            'leases',
          ] as const)
            await transaction.objectStore(store).clear()
          await transaction.objectStore('meta').put(epoch + 1, 'epoch')
        })
      }, true)
      if (result.ok) options.onReset?.()
      return result
    },
    listSessions: () => list('sessions', parseSessionRecord),
    countQuarantined: () => access((db) => db.count('quarantine')),
    listResults: () => list('results', parseResultRecord),
    readLessonProgress: () => list('lessons', parseLessonProgress),
    readDatasetEpoch: () =>
      access(async (db) => {
        const epoch = await db.get('meta', 'epoch')
        if (!isNonnegativeInteger(epoch)) throw new TypeError('Invalid dataset epoch')
        return epoch
      }),
    readSettings: () =>
      access(async (db) => {
        const transaction = db.transaction(['settings', 'quarantine'], 'readwrite')
        return commitTransaction(transaction, async () => {
          const raw = await transaction.objectStore('settings').get('preferences')
          if (raw === undefined) return { ...DEFAULT_SETTINGS }
          const parsed = parseSettings(raw)
          if (parsed.valid) return parsed.value
          await transaction
            .objectStore('quarantine')
            .put(
              { store: 'settings', key: 'preferences', value: raw, issues: parsed.issues },
              'settings:preferences',
            )
          await transaction.objectStore('settings').delete('preferences')
          return { ...DEFAULT_SETTINGS }
        })
      }),
    writeSettings: (settings, expectedEpoch) =>
      access(async (db) => {
        const parsed = parseSettings(settings)
        if (!parsed.valid) throw new TypeError(parsed.issues.join('; '))
        const transaction = db.transaction(['settings', 'meta'], 'readwrite')
        await commitTransaction(transaction, async () => {
          await assertDatasetEpoch(transaction, expectedEpoch)
          await transaction
            .objectStore('settings')
            .put({ formatVersion: 1, ...parsed.value }, 'preferences')
        })
      }, true),
    writeLessonProgress: (progress, expectedEpoch) =>
      access(async (db) => {
        const parsed = parseLessonProgress(progress)
        if (!parsed.valid) throw new TypeError(parsed.issues.join('; '))
        const transaction = db.transaction(['lessons', 'meta'], 'readwrite')
        await commitTransaction(transaction, async () => {
          await assertDatasetEpoch(transaction, expectedEpoch)
          await transaction.objectStore('lessons').put({ formatVersion: 1, ...parsed.value })
        })
      }, true),
    removeQuarantined: () =>
      access(async (db) => {
        const transaction = db.transaction('quarantine', 'readwrite')
        await commitTransaction(transaction, async () => {
          await transaction.store.clear()
        })
      }, true),
  }
}
