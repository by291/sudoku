import type { IDBPDatabase, IDBPTransaction } from 'idb'
import type { SudokuDatabase } from '@/storage/database'
import { commitTransaction } from '@/storage/database'
import { StorageConflict } from '@/storage/ownership'
import { isNonnegativeInteger } from '@/storage/records'
import type { SummaryQueryKind, SummarySnapshot } from '@/storage/readModels'
import {
  InvalidStoredSummary,
  parseSummary,
  parseSummaryState,
  summaryStore,
} from '@/storage/projections'

// Summary readers and maintenance share coverage metadata without depending on each other.
type ReadTransaction = IDBPTransaction<
  SudokuDatabase,
  ('sessions' | 'results' | 'sessionSummaries' | 'resultSummaries' | 'meta')[],
  'readonly'
>

export async function readSummarySnapshot(
  transaction: ReadTransaction,
  kind?: SummaryQueryKind,
): Promise<SummarySnapshot> {
  const epoch = await transaction.objectStore('meta').get('epoch')
  if (!isNonnegativeInteger(epoch)) {
    throw new TypeError('Invalid dataset epoch')
  }

  const state = parseSummaryState(await transaction.objectStore('meta').get('summaries'))
  const ready = kind ? state[kind].complete : state.sessions.complete && state.results.complete
  return { epoch, generation: state.generation, coverage: ready ? 'ready' : 'pending' }
}

export type ProjectionRepair = { kind: SummaryQueryKind; id: string | null }

/** Appends a coverage repair when stored projection data is corrupt; never validates canonical payloads. */
export function readProjection(
  value: unknown,
  kind: SummaryQueryKind,
  repairs: ProjectionRepair[],
) {
  try {
    return parseSummary(value, kind)
  } catch (error) {
    if (!(error instanceof InvalidStoredSummary)) {
      throw error
    }

    repairs.push({ kind, id: null })
    return null
  }
}

/** Invalidates only the captured snapshot; newer writes or resets reject the repair. */
export async function invalidateProjectionCoverage(
  db: IDBPDatabase<SudokuDatabase>,
  snapshot: SummarySnapshot,
  missing: readonly ProjectionRepair[],
): Promise<number> {
  const transaction = db.transaction(['meta', 'sessionSummaries', 'resultSummaries'], 'readwrite')
  return commitTransaction(transaction, async () => {
    const metadata = transaction.objectStore('meta')
    const epoch = await metadata.get('epoch')
    const state = parseSummaryState(await metadata.get('summaries'))
    // The read proved a gap or corrupt projection. Fence repairs against newer writes and resets.
    if (epoch !== snapshot.epoch || state.generation !== snapshot.generation) {
      throw new StorageConflict(
        'revision-conflict',
        'Saved records changed; retry the summary read',
      )
    }

    let changed = false
    for (const { kind, id } of missing) {
      const coverage = state[kind]
      if (id === null) {
        // Rebuild the derived store from canonical keys, including removal of corrupt orphans.
        await transaction.objectStore(summaryStore(kind)).clear()
        state[kind] = { complete: false, after: null }
        changed = true
      } else if (coverage.complete || (coverage.after !== null && id <= coverage.after)) {
        state[kind] = { complete: false, after: null }
        changed = true
      }
    }

    if (changed) {
      state.generation++
      if (!Number.isSafeInteger(state.generation)) {
        throw new TypeError('Summary generation exhausted')
      }
      await metadata.put(state, 'summaries')
    }

    return state.generation
  })
}
