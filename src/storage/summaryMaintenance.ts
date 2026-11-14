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
import type { SummaryMaintenance, SummaryQueryKind } from '@/storage/readModels'
import { parseSummaryState, projectRecord, summaryStore } from '@/storage/projections'
import type { SummaryState } from '@/storage/projections'
import { readSummarySnapshot } from '@/storage/summaryCoverage'

type MaintenanceOptions = {
  db: IDBPDatabase<SudokuDatabase>
  validators: SnapshotValidators
  prepareValidation?: () => Promise<void>
  signal?: AbortSignal
}

type CapturedSummary = {
  epoch: number
  state: SummaryState
  key: IDBValidKey | undefined
  raw: unknown
}

type ParsedRecord = ParseResult<SessionRecord | ResultRecord>

function assertMaintenanceActive(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('Summary maintenance cancelled', 'AbortError')
  }
}

async function captureSummary(db: IDBPDatabase<SudokuDatabase>, kind: SummaryQueryKind) {
  const read = db.transaction([kind, 'meta'], 'readonly')

  return commitTransaction(read, async (): Promise<CapturedSummary> => {
    const metadata = read.objectStore('meta')
    const epoch = await metadata.get('epoch')
    if (!isNonnegativeInteger(epoch)) {
      throw new TypeError('Invalid dataset epoch')
    }

    const state = parseSummaryState(await metadata.get('summaries'))
    const after = state[kind].after
    const isExclusive = true
    const range = after ? IDBKeyRange.lowerBound(after, isExclusive) : undefined
    const cursor = await read.objectStore(kind).openCursor(range)

    return {
      epoch,
      state,
      key: cursor?.primaryKey,
      raw: cursor?.value,
    }
  })
}

async function commitSummary(input: {
  db: IDBPDatabase<SudokuDatabase>
  kind: SummaryQueryKind
  captured: CapturedSummary
  parsed: ParsedRecord | null
  signal?: AbortSignal
}) {
  const { db, kind, captured, parsed, signal } = input
  const transaction = db.transaction(
    [
      // Maintenance can move a canonical record and update its projection and checkpoint.
      kind,
      'sessionSummaries',
      'resultSummaries',
      'quarantine',
      'meta',
    ],
    'readwrite',
  )

  await commitTransaction(transaction, async () => {
    assertMaintenanceActive(signal)
    const metadata = transaction.objectStore('meta')
    const epoch = await metadata.get('epoch')
    const state = parseSummaryState(await metadata.get('summaries'))

    // Validation ran outside the transaction, so a paired write can invalidate the capture.
    if (epoch !== captured.epoch || state.generation !== captured.state.generation) {
      throw new StorageConflict(
        'revision-conflict',
        'Local data changed during summary maintenance',
      )
    }

    const key = captured.key
    if (key === undefined) {
      state[kind].complete = true
    } else if (parsed?.valid) {
      const record = parsed.value
      const revision = 'revision' in record ? record.revision : 0
      await transaction
        .objectStore(summaryStore(kind))
        .put(projectRecord(record.session, revision, kind))
    } else if (parsed) {
      await transaction.objectStore('quarantine').put(
        {
          store: kind,
          key,
          value: captured.raw,
          issues: parsed.issues,
        },
        `${kind}:${key}`,
      )
      const range = IDBKeyRange.only(key)
      await transaction.objectStore(kind).delete(range)
      await transaction.objectStore(summaryStore(kind)).delete(range)
    }

    // A valid key can advance the cursor even when its payload was quarantined.
    if (isIdentifier(key)) {
      state[kind].after = key
    }

    const generation = state.generation + 1
    if (!isNonnegativeInteger(generation)) {
      throw new TypeError('Summary generation exhausted')
    }
    await metadata.put({ ...state, generation }, 'summaries')
  })
}

/** Rebuilds projections one captured record at a time, fencing every repair. */
export async function maintainSummaries(options: MaintenanceOptions): Promise<SummaryMaintenance> {
  const { db, validators, prepareValidation, signal } = options
  let processed = 0
  let isPrepared = false

  for (const kind of ['sessions', 'results'] as const) {
    while (true) {
      assertMaintenanceActive(signal)
      const state = parseSummaryState(await db.get('meta', 'summaries'))
      if (state[kind].complete) {
        break
      }

      if (!isPrepared) {
        // No asynchronous engine work belongs inside an IndexedDB transaction.
        await prepareValidation?.()
        isPrepared = true
        assertMaintenanceActive(signal)
      }

      const captured = await captureSummary(db, kind)
      const parse = kind === 'sessions' ? parseSessionRecord : parseResultRecord

      // Inconclusive validation throws before writing either projections or quarantine.
      const parsed = captured.key === undefined ? null : parse(captured.raw, validators)
      assertMaintenanceActive(signal)
      await commitSummary({
        db,
        kind,
        captured,
        parsed,
        signal,
      })

      if (captured.key !== undefined) {
        processed++
      }

      // Yield between records so navigation or reset can cancel without leaving a transaction open.
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
  }

  const transaction = db.transaction('meta', 'readonly')
  return commitTransaction(transaction, async () => ({
    ...(await readSummarySnapshot(transaction)),
    processed,
  }))
}
