import { openDB, unwrap } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'
import { initialSummaryState } from '@/storage/projections'

export type SummaryIndexes = {
  'by-order': [number, string]
  'by-variant-order': [string, number, string]
  'by-mode-order': [string, number, string]
  'by-variant-mode-order': [string, string, number, string]
  'by-unfinished-order': [number, number, string]
  'by-variant-unfinished-order': [string, number, number, string]
  'by-mode-unfinished-order': [string, number, number, string]
  'by-variant-mode-unfinished-order': [string, string, number, number, string]
}

export interface SudokuDatabase extends DBSchema {
  sessions: {
    key: string
    value: unknown
    indexes: {
      'by-mode': string
      'by-date': string
      'by-lesson': string
      'by-slot': [string, string]
      'by-format-mode': [number, string]
    }
  }
  results: { key: string; value: unknown }
  sessionSummaries: { key: string; value: unknown; indexes: SummaryIndexes }
  resultSummaries: { key: string; value: unknown; indexes: SummaryIndexes }
  lessons: { key: string; value: unknown }
  settings: { key: string; value: unknown }
  quarantine: { key: string; value: unknown }
  leases: { key: string; value: unknown }
  meta: { key: string; value: unknown }
}

export type DatabaseProvider = () => Promise<IDBPDatabase<SudokuDatabase>>

export function openSudokuDatabase(name = 'sudoku-local'): Promise<IDBPDatabase<SudokuDatabase>> {
  return openDB<SudokuDatabase>(name, 2, {
    upgrade(database, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
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
      }
      if (oldVersion < 2) {
        transaction
          .objectStore('sessions')
          .createIndex('by-format-mode', ['formatVersion', 'session.mode'])
        transaction
          .objectStore('sessions')
          .createIndex('by-slot', ['session.mode', 'session.puzzle.rules.kind'])
        for (const name of ['sessionSummaries', 'resultSummaries'] as const) {
          const store = database.createObjectStore(name, { keyPath: 'id' })
          store.createIndex('by-order', ['orderTime', 'id'])
          store.createIndex('by-variant-order', ['variant', 'orderTime', 'id'])
          store.createIndex('by-mode-order', ['mode', 'orderTime', 'id'])
          store.createIndex('by-variant-mode-order', ['variant', 'mode', 'orderTime', 'id'])
          store.createIndex('by-unfinished-order', ['unfinished', 'orderTime', 'id'])
          store.createIndex('by-variant-unfinished-order', [
            'variant',
            'unfinished',
            'orderTime',
            'id',
          ])
          store.createIndex('by-mode-unfinished-order', ['mode', 'unfinished', 'orderTime', 'id'])
          store.createIndex('by-variant-mode-unfinished-order', [
            'variant',
            'mode',
            'unfinished',
            'orderTime',
            'id',
          ])
        }
        // Upgrades never load or validate canonical payloads; legacy coverage is explicit.
        unwrap(transaction.objectStore('meta')).put(
          initialSummaryState(oldVersion === 0),
          'summaries',
        )
      }
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
