import type { IDBPDatabase } from 'idb'
import type { SudokuDatabase } from '@/storage/database'
import { commitTransaction } from '@/storage/database'
import { StorageConflict } from '@/storage/ownership'
import {
  isIdentifier,
  isNonnegativeInteger,
  parseResultRecord,
  parseSessionRecord,
} from '@/storage/records'
import type { ParseResult } from '@/sudoku/contracts'
import type { ResultRecord, SessionRecord, SnapshotValidators } from '@/storage/records'
import type { SummaryMaintenance } from '@/storage/readModels'
import { parseSummaryState, projectRecord, summaryStore } from '@/storage/projections'
import { readSummarySnapshot } from '@/storage/summaryCoverage'

function assertMaintenanceActive(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('Summary maintenance cancelled', 'AbortError')
  }
}

/** Processes one owned payload per transaction, yielding between records and fencing every repair. */
export async function maintainSummaries(
  db: IDBPDatabase<SudokuDatabase>,
  validators: SnapshotValidators,
  prepareValidation?: () => Promise<void>,
  signal?: AbortSignal,
): Promise<SummaryMaintenance> {
  let processed = 0
  let prepared = false
  for (const kind of ['sessions', 'results'] as const) {
    while (true) {
      assertMaintenanceActive(signal)
      const state = parseSummaryState(await db.get('meta', 'summaries'))
      if (state[kind].complete) {
        break
      }
      if (!prepared) {
        await prepareValidation?.()
        prepared = true
        assertMaintenanceActive(signal)
      }

      // Capture one owned payload only after validation readiness; no asynchronous engine work enters IDB.
      const read = db.transaction([kind, 'meta'], 'readonly')
      const captured = await commitTransaction(read, async () => {
        const epoch = await read.objectStore('meta').get('epoch')
        if (!isNonnegativeInteger(epoch)) {
          throw new TypeError('Invalid dataset epoch')
        }

        const currentState = parseSummaryState(await read.objectStore('meta').get('summaries'))
        const after = currentState[kind].after
        const cursor = await read
          .objectStore(kind)
          .openCursor(after ? IDBKeyRange.lowerBound(after, true) : undefined)
        return { epoch, state: currentState, key: cursor?.primaryKey, raw: cursor?.value }
      })

      // Inconclusive validation throws before writes, preserving canonical data and quarantine.
      let parsed: ParseResult<SessionRecord | ResultRecord> | null = null
      if (captured.key !== undefined) {
        parsed =
          kind === 'sessions'
            ? parseSessionRecord(captured.raw, validators)
            : parseResultRecord(captured.raw, validators)
      }

      assertMaintenanceActive(signal)

      const write = db.transaction(
        [kind, 'sessionSummaries', 'resultSummaries', 'quarantine', 'meta'],
        'readwrite',
      )
      await commitTransaction(write, async () => {
        assertMaintenanceActive(signal)
        const epoch = await write.objectStore('meta').get('epoch')
        const currentState = parseSummaryState(await write.objectStore('meta').get('summaries'))
        // Validation runs outside the write transaction; any paired write invalidates this capture.
        if (epoch !== captured.epoch || currentState.generation !== captured.state.generation) {
          throw new StorageConflict(
            'revision-conflict',
            'Local data changed during summary maintenance',
          )
        }

        if (captured.key === undefined) {
          currentState[kind].complete = true
        } else {
          if (parsed?.valid) {
            const record = parsed.value
            const revision =
              'revision' in record && isNonnegativeInteger(record.revision) ? record.revision : 0
            await write
              .objectStore(summaryStore(kind))
              .put(projectRecord(record.session, revision, kind))
          } else if (parsed) {
            await write
              .objectStore('quarantine')
              .put(
                { store: kind, key: captured.key, value: captured.raw, issues: parsed.issues },
                `${kind}:${captured.key}`,
              )
            await write.objectStore(kind).delete(captured.key)
            await write.objectStore(summaryStore(kind)).delete(captured.key)
          }
          // Invalid identities are deleted above; only valid IDs can become resumable cursors.
          if (isIdentifier(captured.key)) {
            currentState[kind].after = captured.key
          }
        }

        currentState.generation++
        if (!Number.isSafeInteger(currentState.generation)) {
          throw new TypeError('Summary generation exhausted')
        }
        await write.objectStore('meta').put(currentState, 'summaries')
      })

      if (captured.key !== undefined) {
        processed++
      }
      // Let navigation/reset abort between bounded records; never hold an IDB transaction open.
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
  }

  const transaction = db.transaction(['sessionSummaries', 'resultSummaries', 'meta'], 'readonly')
  return commitTransaction(transaction, async () => ({
    ...(await readSummarySnapshot(transaction)),
    processed,
  }))
}
