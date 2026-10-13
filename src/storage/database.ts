import { openDB, unwrap } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'

export interface SudokuDatabase extends DBSchema {
  sessions: {
    key: string
    value: unknown
    indexes: { 'by-mode': string; 'by-date': string; 'by-lesson': string }
  }
  results: { key: string; value: unknown }
  lessons: { key: string; value: unknown }
  settings: { key: string; value: unknown }
  quarantine: { key: string; value: unknown }
  leases: { key: string; value: unknown }
  meta: { key: string; value: unknown }
}

export type DatabaseProvider = () => Promise<IDBPDatabase<SudokuDatabase>>

export function openSudokuDatabase(name = 'sudoku-local'): Promise<IDBPDatabase<SudokuDatabase>> {
  return openDB<SudokuDatabase>(name, 1, {
    upgrade(database, _oldVersion, _newVersion, transaction) {
      const sessions = database.createObjectStore('sessions', { keyPath: 'session.id' })
      sessions.createIndex('by-mode', 'session.mode')
      sessions.createIndex('by-date', 'session.metadata.challengeDate')
      sessions.createIndex('by-lesson', 'session.metadata.lessonId')
      database.createObjectStore('results', { keyPath: 'session.id' })
      database.createObjectStore('lessons', { keyPath: 'lessonId' })

      for (const store of ['settings', 'quarantine', 'leases', 'meta'] as const) {
        database.createObjectStore(store)
      }

      // The upgrade request belongs to openDB's version-change transaction;
      // use its native request so abort is reported by openDB, not an ignored Promise.
      unwrap(transaction.objectStore('meta')).put(1, 'epoch')
    },
    blocking(_currentVersion, _blockedVersion, event) {
      const target = event.target
      if (target instanceof IDBDatabase) {
        target.close()
      }
    },
  })
}

export async function commitTransaction<T>(
  transaction: { done: Promise<void>; abort(): void },
  operation: () => Promise<T>,
): Promise<T> {
  const work = Promise.resolve()
    .then(operation)
    .catch((error: unknown) => {
      try {
        transaction.abort()
      } catch (abortError) {
        // A request may already have aborted the transaction. Retain its original failure.
        if (!(abortError instanceof DOMException && abortError.name === 'InvalidStateError')) {
          throw new AggregateError([error, abortError], 'Operation and rollback failed', {
            cause: abortError,
          })
        }
      }
      throw error
    })
  const [value] = await Promise.all([work, transaction.done])

  return value
}
