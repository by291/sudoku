import type { IDBPDatabase, IDBPTransaction } from 'idb'
import type { ProjectionTransaction } from '@/storage/projections'
import type { DatabaseProvider, SudokuDatabase } from '@/storage/database'
import { commitTransaction } from '@/storage/database'
import { assertOwnership, StorageConflict } from '@/storage/ownership'
import type { OwnershipToken } from '@/storage/ownership'
import type { GameSession } from '@/features/game/model/session'
import type { LessonProgress, ResultRecord, SessionRecord, StorageOutcome } from '@/storage/records'
import type { ParseResult, SudokuVariant } from '@/sudoku/contracts'
import type {
  CompletionCountsRead,
  HomeRead,
  DailyStatusesRead,
  SummaryPage,
  SummaryPageQuery,
  OverviewRead,
  SlotSummaryRead,
  SummaryMaintenance,
} from '@/storage/readModels'
import * as reads from '@/storage/readRepository'
import {
  advanceSummaryGeneration,
  initialSummaryState,
  projectRecord,
  summaryStore,
} from '@/storage/projections'
import {
  parseLessonProgress,
  parseResultRecord,
  parseSessionRecord,
  parseSettings,
  parseSession,
  isNonnegativeInteger,
  SnapshotValidationUnavailable,
} from '@/storage/records'
import type { Settings } from '@/features/settings/model/preferences'
import { DEFAULT_SETTINGS } from '@/features/settings/model/preferences'
import { parseBackup, readBackupSnapshot, replaceBackupSnapshot } from '@/storage/backup'
import type { SnapshotValidators } from '@/storage/records'
import type { BackupExport } from '@/storage/backup'

export interface GameRepository {
  readSession(id: string): Promise<StorageOutcome<SessionRecord | null>>
  readResult(id: string): Promise<StorageOutcome<ResultRecord | null>>
  readSlot(
    mode: 'free' | 'learning',
    variant?: SudokuVariant,
  ): Promise<StorageOutcome<SessionRecord | null>>
  readSlotSummary(
    mode: 'free' | 'learning',
    variant?: SudokuVariant,
  ): Promise<StorageOutcome<SlotSummaryRead>>
  readHome(): Promise<StorageOutcome<HomeRead>>
  readCompletionCounts(): Promise<StorageOutcome<CompletionCountsRead>>
  readDailyStatuses(date: string): Promise<StorageOutcome<DailyStatusesRead>>
  readSummaryPage(query: SummaryPageQuery): Promise<StorageOutcome<SummaryPage>>
  readOverview(variant: SudokuVariant, today: string): Promise<StorageOutcome<OverviewRead>>
  maintainSummaries(signal?: AbortSignal): Promise<StorageOutcome<SummaryMaintenance>>
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
  exportBackup(exportedAt: string): Promise<StorageOutcome<BackupExport>>
  restoreBackup(text: string, expectedEpoch: number): Promise<StorageOutcome<void>>
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

export type { DatabaseProvider } from '@/storage/database'

function assertActive(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('Session creation cancelled', 'AbortError')
  }
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
  if (!isNonnegativeInteger(expectedEpoch) || current !== expectedEpoch) {
    throw new StorageConflict('revision-conflict', 'Local data was cleared during this operation')
  }
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
  validators: SnapshotValidators,
  options: {
    now?: () => number
    onReset?: () => void
    prepareValidation?: () => Promise<void>
  } = {},
): GameRepository {
  function isMatchingPrevious(raw: unknown, previous: { id: string; revision: number }): boolean {
    const parsed = parseSessionRecord(raw, validators)

    return (
      parsed.valid &&
      parsed.value.session.id === previous.id &&
      parsed.value.revision === previous.revision
    )
  }

  async function access<T>(
    operation: (db: IDBPDatabase<SudokuDatabase>) => Promise<T>,
    write = false,
    validate = false,
  ): Promise<StorageOutcome<T>> {
    let db: IDBPDatabase<SudokuDatabase>
    try {
      // Finish asynchronous engine readiness before opening semantic-validation transactions.
      if (validate) {
        await options.prepareValidation?.()
      }
      db = await database()
    } catch (error) {
      return storageError(error, 'unavailable')
    }
    try {
      return { ok: true, value: await operation(db) }
    } catch (error) {
      if (error instanceof StorageConflict) {
        return { ok: false, error: { kind: error.kind, message: error.message } }
      }

      const unavailable = error instanceof SnapshotValidationUnavailable || !write

      return storageError(error, unavailable ? 'unavailable' : 'write-failed')
    }
  }

  async function list<T>(
    store: 'sessions' | 'results' | 'lessons',
    parse: (value: unknown) => ParseResult<T>,
  ): Promise<StorageOutcome<readonly T[]>> {
    return access(
      async (db) => {
        const transaction = db.transaction(
          [store, 'sessionSummaries', 'resultSummaries', 'quarantine', 'meta'],
          'readwrite',
        )

        return commitTransaction(transaction, async () => {
          const objectStore = transaction.objectStore(store)
          const records: T[] = []
          let cursor = await objectStore.openCursor()

          while (cursor) {
            const parsed = parse(cursor.value)
            if (parsed.valid) {
              records.push(parsed.value)
            } else {
              await transaction
                .objectStore('quarantine')
                .put(
                  { store, key: cursor.primaryKey, value: cursor.value, issues: parsed.issues },
                  `${store}:${String(cursor.primaryKey)}`,
                )
              await cursor.delete()
              if (store !== 'lessons') {
                await transaction.objectStore(summaryStore(store)).delete(String(cursor.primaryKey))
                await advanceSummaryGeneration(transaction)
              }
            }

            cursor = await cursor.continue()
          }

          return records
        })
      },
      false,
      store !== 'lessons',
    )
  }

  async function readSelected<T extends SessionRecord | ResultRecord>(
    kind: 'sessions' | 'results',
    id: string,
    parse: (value: unknown) => ParseResult<T>,
  ): Promise<StorageOutcome<T | null>> {
    return access(
      async (db) => {
        const transaction = db.transaction(
          [kind, 'sessionSummaries', 'resultSummaries', 'quarantine', 'meta'],
          'readwrite',
        )
        return commitTransaction(transaction, async () => {
          const raw = await transaction.objectStore(kind).get(id)
          if (raw === undefined) {
            return null
          }
          const parsed = parse(raw)
          if (parsed.valid) {
            return parsed.value
          }
          await transaction
            .objectStore('quarantine')
            .put({ store: kind, key: id, value: raw, issues: parsed.issues }, `${kind}:${id}`)
          await transaction.objectStore(kind).delete(id)
          await transaction.objectStore(summaryStore(kind)).delete(id)
          await advanceSummaryGeneration(transaction)
          return null
        })
      },
      false,
      true,
    )
  }

  async function readSlotRecords(
    transaction: ProjectionTransaction,
    mode: 'free' | 'learning',
    variant: SudokuVariant = 'classic',
  ): Promise<SessionRecord[]> {
    const sessions = transaction.objectStore('sessions')
    const rawRecords =
      mode === 'free'
        ? await sessions.index('by-slot').getAll([mode, variant], 2)
        : await sessions.index('by-mode').getAll(mode, 2)
    if (mode === 'free' && variant === 'classic') {
      // Format-1 Classic saves may omit rules and therefore have no modern slot index entry.
      rawRecords.push(...(await sessions.index('by-format-mode').getAll([1, mode], 2)))
    }
    const records = new Map<string, SessionRecord>()
    for (const raw of rawRecords) {
      const parsed = parseSessionRecord(raw, validators)
      if (!parsed.valid) {
        throw new StorageConflict(
          'revision-conflict',
          'The active slot contains invalid data; repair saved games',
        )
      }
      records.set(parsed.value.session.id, parsed.value)
    }
    if (records.size > 1) {
      throw new StorageConflict('revision-conflict', 'Multiple records occupy one active slot')
    }
    return [...records.values()]
  }

  return {
    readSession: (id) => readSelected('sessions', id, (raw) => parseSessionRecord(raw, validators)),
    readResult: (id) => readSelected('results', id, (raw) => parseResultRecord(raw, validators)),
    readHome: () => access(reads.readHome),
    readCompletionCounts: () => access(reads.readCompletionCounts),
    readSlotSummary: (mode, variant) => access((db) => reads.readSlotSummary(db, mode, variant)),
    readDailyStatuses: (date) => access((db) => reads.readDailyStatuses(db, date)),
    readSummaryPage: (query) => access((db) => reads.readSummaryPage(db, query)),
    readOverview: (variant, today) => access((db) => reads.readOverview(db, variant, today)),
    maintainSummaries: (signal) =>
      access((db) => reads.maintainSummaries(db, validators, options.prepareValidation, signal)),
    readSlot: (mode, variant) =>
      access(
        async (db) => {
          const transaction = db.transaction('sessions', 'readwrite')
          return commitTransaction(transaction, async () => {
            const records = await readSlotRecords(transaction, mode, variant)
            return records[0] ?? null
          })
        },
        false,
        true,
      ),
    exportBackup: (exportedAt) =>
      access((db) => readBackupSnapshot(db, exportedAt, validators), false, true),
    restoreBackup: async (text, expectedEpoch) => {
      let parsed
      try {
        await options.prepareValidation?.()
        parsed = parseBackup(text, validators)
      } catch (error) {
        return storageError(error, 'unavailable')
      }
      if (!parsed.valid) {
        return storageError(new TypeError(parsed.issues.join('; ')), 'write-failed')
      }
      const result = await access(
        (db) => replaceBackupSnapshot(db, parsed.value, expectedEpoch),
        true,
      )
      if (result.ok) {
        options.onReset?.()
      }
      return result
    },
    writeSession: (session, expectedRevision, token, signal) =>
      access(
        async (db) => {
          const parsed = parseSession(session, validators)
          if (!parsed.valid || token.sessionId !== session.id) {
            throw new TypeError('Invalid session snapshot')
          }

          const transaction = db.transaction(
            [
              'sessions',
              'results',
              'sessionSummaries',
              'resultSummaries',
              'quarantine',
              'leases',
              'meta',
            ],
            'readwrite',
          )

          return commitTransaction(transaction, async () => {
            assertActive(signal)
            await assertOwnership(transaction, token, (options.now ?? Date.now)())
            const raw = await transaction.objectStore('sessions').get(session.id)
            const current = raw === undefined ? null : parseSessionRecord(raw, validators)
            if (
              (raw !== undefined &&
                (!current?.valid || current.value.revision !== expectedRevision)) ||
              (raw === undefined && expectedRevision !== 0)
            ) {
              throw new StorageConflict('revision-conflict', 'The saved revision has changed')
            }

            const record: SessionRecord = {
              formatVersion: 2,
              revision: expectedRevision + 1,
              session: parsed.value,
            }
            assertActive(signal)
            await transaction.objectStore('sessions').put(record)
            await transaction
              .objectStore('sessionSummaries')
              .put(projectRecord(record.session, record.revision, 'sessions'))
            await advanceSummaryGeneration(transaction)
            if (session.completion) {
              const results = transaction.objectStore('results')
              const existing = await results.get(session.id)
              if (existing === undefined) {
                await results.put({ formatVersion: 2, session: parsed.value })
                await transaction
                  .objectStore('resultSummaries')
                  .put(projectRecord(parsed.value, 0, 'results'))
              } else {
                // Upgrade the original result rather than replacing its first completion facts.
                const original = parseResultRecord(existing, validators)
                if (original.valid) {
                  await results.put(original.value)
                  await transaction
                    .objectStore('resultSummaries')
                    .put(projectRecord(original.value.session, 0, 'results'))
                } else {
                  await transaction.objectStore('quarantine').put(
                    {
                      store: 'results',
                      key: session.id,
                      value: existing,
                      issues: original.issues,
                    },
                    `results:${session.id}`,
                  )
                  await results.delete(session.id)
                  await transaction.objectStore('resultSummaries').delete(session.id)
                }
              }
            }

            assertActive(signal)

            return record
          })
        },
        true,
        true,
      ),
    replaceActiveSession: (session, token, previous, signal) =>
      access(
        async (db) => {
          const parsed = parseSession(session, validators)
          if (!parsed.valid || token.sessionId !== session.id || session.mode === 'daily') {
            throw new TypeError('Invalid replacement')
          }

          const mode = session.mode
          const transaction = db.transaction(
            [
              'sessions',
              'results',
              'sessionSummaries',
              'resultSummaries',
              'quarantine',
              'leases',
              'meta',
            ],
            'readwrite',
          )

          return commitTransaction(transaction, async () => {
            assertActive(signal)
            await assertOwnership(transaction, token, (options.now ?? Date.now)())
            const slot = await readSlotRecords(transaction, mode, session.puzzle.rules.kind)
            if (
              (await transaction.objectStore('sessions').get(session.id)) ||
              slot.length > 1 ||
              (slot.length === 1 && (!previous || !isMatchingPrevious(slot[0], previous)))
            ) {
              throw new StorageConflict('revision-conflict', 'The active game slot has changed')
            }

            if (previous) {
              await assertOwnership(transaction, previous.token, (options.now ?? Date.now)())
              const raw = await transaction.objectStore('sessions').get(previous.id)
              const previousRecord = parseSessionRecord(raw, validators)
              if (
                !isMatchingPrevious(raw, previous) ||
                !previousRecord.valid ||
                !belongsToSlot(previousRecord.value.session, session) ||
                previous.token.sessionId !== previous.id
              ) {
                throw new StorageConflict('revision-conflict', 'Previous session changed')
              }

              assertActive(signal)
              await transaction.objectStore('sessions').delete(previous.id)
              await transaction.objectStore('sessionSummaries').delete(previous.id)
            }

            const record: SessionRecord = { formatVersion: 2, revision: 1, session: parsed.value }
            assertActive(signal)
            await transaction.objectStore('sessions').put(record)
            await transaction
              .objectStore('sessionSummaries')
              .put(projectRecord(record.session, record.revision, 'sessions'))
            await advanceSummaryGeneration(transaction)
            assertActive(signal)

            return record
          })
        },
        true,
        true,
      ),
    clearAll: async () => {
      const result = await access(async (db) => {
        const transaction = db.transaction(
          [
            'sessions',
            'results',
            'sessionSummaries',
            'resultSummaries',
            'lessons',
            'settings',
            'quarantine',
            'leases',
            'meta',
          ],
          'readwrite',
        )
        await commitTransaction(transaction, async () => {
          const epoch = await transaction.objectStore('meta').get('epoch')
          if (typeof epoch !== 'number' || !Number.isSafeInteger(epoch)) {
            throw new TypeError('Invalid dataset epoch')
          }

          for (const store of [
            'sessions',
            'results',
            'sessionSummaries',
            'resultSummaries',
            'lessons',
            'settings',
            'quarantine',
            'leases',
          ] as const) {
            await transaction.objectStore(store).clear()
          }

          await transaction.objectStore('meta').put(epoch + 1, 'epoch')
          await transaction.objectStore('meta').put(initialSummaryState(true), 'summaries')
        })
      }, true)
      if (result.ok) {
        options.onReset?.()
      }

      return result
    },
    listSessions: () => list('sessions', (value) => parseSessionRecord(value, validators)),
    countQuarantined: () => access((db) => db.count('quarantine')),
    listResults: () => list('results', (value) => parseResultRecord(value, validators)),
    readLessonProgress: () => list('lessons', parseLessonProgress),
    readDatasetEpoch: () =>
      access(async (db) => {
        const epoch = await db.get('meta', 'epoch')
        if (!isNonnegativeInteger(epoch)) {
          throw new TypeError('Invalid dataset epoch')
        }

        return epoch
      }),
    readSettings: () =>
      access(async (db) => {
        const transaction = db.transaction(['settings', 'quarantine'], 'readwrite')

        return commitTransaction(transaction, async () => {
          const raw = await transaction.objectStore('settings').get('preferences')
          if (raw === undefined) {
            return { ...DEFAULT_SETTINGS }
          }

          const parsed = parseSettings(raw)
          if (parsed.valid) {
            return parsed.value
          }

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
        if (!parsed.valid) {
          throw new TypeError(parsed.issues.join('; '))
        }

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
        if (!parsed.valid) {
          throw new TypeError(parsed.issues.join('; '))
        }

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
