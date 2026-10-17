import type { IDBPDatabase, IDBPTransaction } from 'idb'
import type { SudokuDatabase, SummaryIndexes } from '@/storage/database'
import { commitTransaction } from '@/storage/database'
import { StorageConflict } from '@/storage/ownership'
import { SUDOKU_VARIANTS } from '@/sudoku/catalogue'
import type { SudokuVariant } from '@/sudoku/contracts'
import { getChallengeDate, getDailyFormalId, isChallengeDate } from '@/features/game/model/daily'
import type { DailyVariantStatus } from '@/features/game/model/daily'
import {
  isIdentifier,
  isNonnegativeInteger,
  parseResultRecord,
  parseSessionRecord,
} from '@/storage/records'
import type { SnapshotValidators } from '@/storage/records'
import type {
  CompletionCountsRead,
  DailyStatusesRead,
  HomeRead,
  OverviewRead,
  RecordSummary,
  SlotSummaryRead,
  SummaryMaintenance,
  SummaryPage,
  SummaryPageQuery,
  SummaryQueryKind,
  SummarySnapshot,
} from '@/storage/readModels'
import { SUMMARY_PAGE_SIZE } from '@/storage/readModels'
import {
  InvalidStoredSummary,
  parseSummary,
  parseSummaryState,
  projectRecord,
  summaryStore,
} from '@/storage/projections'

type ReadTransaction = IDBPTransaction<
  SudokuDatabase,
  ('sessions' | 'results' | 'sessionSummaries' | 'resultSummaries' | 'meta')[],
  'readonly'
>

async function readState(
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

function prefixRange(prefix: (string | number)[], after?: [number, string]): IDBKeyRange {
  return IDBKeyRange.bound(after ? [...prefix, ...after] : prefix, [...prefix, []], !!after)
}

export async function readHome(db: IDBPDatabase<SudokuDatabase>): Promise<HomeRead> {
  const transaction = db.transaction(['sessionSummaries', 'resultSummaries', 'meta'], 'readonly')
  return commitTransaction(transaction, async () => {
    const snapshot = await readState(transaction)
    if (snapshot.coverage === 'pending') {
      return { ...snapshot, unfinishedCount: null, resultCount: null }
    }
    const unfinishedCount = await transaction
      .objectStore('sessionSummaries')
      .index('by-unfinished-order')
      .count(prefixRange([1]))
    const resultCount = await transaction.objectStore('resultSummaries').count()
    return { ...snapshot, unfinishedCount, resultCount }
  })
}

export async function readCompletionCounts(
  db: IDBPDatabase<SudokuDatabase>,
): Promise<CompletionCountsRead> {
  const transaction = db.transaction(['resultSummaries', 'meta'], 'readonly')
  return commitTransaction(transaction, async () => {
    const snapshot = await readState(transaction, 'results')
    if (snapshot.coverage === 'pending') {
      return { ...snapshot, counts: null }
    }
    const counts = {
      classic: 0,
      diagonal: 0,
      jigsaw: 0,
      killer: 0,
      thermo: 0,
      arrow: 0,
    } satisfies Record<SudokuVariant, number>
    const index = transaction.objectStore('resultSummaries').index('by-variant-order')
    // All navigation counts share one snapshot and need only index keys, not saved boards.
    await Promise.all(
      SUDOKU_VARIANTS.map(async (variant) => {
        counts[variant] = await index.count(prefixRange([variant]))
      }),
    )
    return { ...snapshot, counts }
  })
}

function queryIndex(query: SummaryPageQuery): {
  index: keyof SummaryIndexes
  prefix: (string | number)[]
} {
  const prefix: (string | number)[] = []
  if (query.variant) {
    prefix.push(query.variant)
  }
  if (query.mode) {
    prefix.push(query.mode)
  }
  if (query.unfinishedOnly) {
    prefix.push(1)
  }
  if (query.variant && query.mode && query.unfinishedOnly) {
    return { index: 'by-variant-mode-unfinished-order', prefix }
  }
  if (query.variant && query.mode) {
    return { index: 'by-variant-mode-order', prefix }
  }
  if (query.variant && query.unfinishedOnly) {
    return { index: 'by-variant-unfinished-order', prefix }
  }
  if (query.mode && query.unfinishedOnly) {
    return { index: 'by-mode-unfinished-order', prefix }
  }
  if (query.variant) {
    return { index: 'by-variant-order', prefix }
  }
  if (query.mode) {
    return { index: 'by-mode-order', prefix }
  }
  if (query.unfinishedOnly) {
    return { index: 'by-unfinished-order', prefix }
  }
  return { index: 'by-order', prefix }
}

export async function readSummaryPage(
  db: IDBPDatabase<SudokuDatabase>,
  query: SummaryPageQuery,
): Promise<SummaryPage> {
  const transaction = db.transaction(['sessionSummaries', 'resultSummaries', 'meta'], 'readonly')
  const repairs: ProjectionRepair[] = []
  const result: SummaryPage = await commitTransaction(transaction, async () => {
    const snapshot = await readState(transaction, query.kind)
    const filter = {
      kind: query.kind,
      variant: query.variant ?? null,
      mode: query.mode ?? null,
      unfinishedOnly: query.unfinishedOnly ?? false,
    }
    const cursor = query.cursor
    if (
      cursor &&
      (cursor.epoch !== snapshot.epoch ||
        cursor.generation !== snapshot.generation ||
        cursor.kind !== filter.kind ||
        cursor.variant !== filter.variant ||
        cursor.mode !== filter.mode ||
        cursor.unfinishedOnly !== filter.unfinishedOnly ||
        !Number.isFinite(cursor.time) ||
        !isIdentifier(cursor.id))
    ) {
      throw new StorageConflict('revision-conflict', 'Saved records changed; reload the first page')
    }
    if (snapshot.coverage === 'pending') {
      return { ...snapshot, rows: [], nextCursor: null }
    }
    const { index, prefix } = queryIndex(query)
    const raw = await transaction
      .objectStore(summaryStore(query.kind))
      .index(index)
      .getAll(
        prefixRange(prefix, cursor ? [cursor.time, cursor.id] : undefined),
        SUMMARY_PAGE_SIZE + 1,
      )
    const rows = []
    for (const value of raw.slice(0, SUMMARY_PAGE_SIZE)) {
      const row = readProjection(value, query.kind, repairs)
      if (!row) {
        return { ...snapshot, coverage: 'pending', rows: [], nextCursor: null }
      }
      rows.push(row)
    }
    const last = rows.at(-1)
    return {
      ...snapshot,
      rows,
      nextCursor:
        raw.length > SUMMARY_PAGE_SIZE && last
          ? {
              epoch: snapshot.epoch,
              generation: snapshot.generation,
              ...filter,
              time: last.orderTime,
              id: last.id,
            }
          : null,
    }
  })
  if (repairs.length > 0) {
    result.generation = await invalidateProjectionCoverage(db, result, repairs)
  }
  return result
}

type ProjectionRepair = { kind: SummaryQueryKind; id: string | null }

function readProjection(value: unknown, kind: SummaryQueryKind, repairs: ProjectionRepair[]) {
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

async function invalidateProjectionCoverage(
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

export async function readSlotSummary(
  db: IDBPDatabase<SudokuDatabase>,
  mode: 'free' | 'learning',
  variant?: SudokuVariant,
): Promise<SlotSummaryRead> {
  const transaction = db.transaction(['sessions', 'sessionSummaries', 'meta'], 'readonly')
  const missing: ProjectionRepair[] = []
  const result: SlotSummaryRead = await commitTransaction(transaction, async () => {
    const snapshot = await readState(transaction, 'sessions')
    // Keys establish target-specific absence even while unrelated legacy payloads await repair.
    const indexedKeys =
      mode === 'free'
        ? await transaction
            .objectStore('sessions')
            .index('by-slot')
            .getAllKeys([mode, variant ?? 'classic'], 2)
        : await transaction.objectStore('sessions').index('by-mode').getAllKeys(mode, 2)
    if (mode === 'free' && (variant ?? 'classic') === 'classic') {
      indexedKeys.push(
        ...(await transaction
          .objectStore('sessions')
          .index('by-format-mode')
          .getAllKeys([1, mode], 2)),
      )
    }
    const keys = [...new Set(indexedKeys)]
    if (keys.length > 1) {
      throw new StorageConflict('revision-conflict', 'Multiple records occupy one active slot')
    }
    const key = keys[0]
    if (key === undefined) {
      return { ...snapshot, coverage: 'ready', summary: null }
    }
    const raw = await transaction.objectStore('sessionSummaries').get(key)
    if (raw === undefined) {
      missing.push({ kind: 'sessions', id: key })
      return { ...snapshot, coverage: 'pending', summary: null }
    }
    const summary = readProjection(raw, 'sessions', missing)
    return { ...snapshot, coverage: summary ? 'ready' : 'pending', summary }
  })
  if (missing.length > 0) {
    result.generation = await invalidateProjectionCoverage(db, result, missing)
  }
  return result
}

export async function readDailyStatuses(
  db: IDBPDatabase<SudokuDatabase>,
  date: string,
): Promise<DailyStatusesRead> {
  if (!isChallengeDate(date)) {
    throw new TypeError('Invalid challenge date')
  }
  const transaction = db.transaction(
    ['sessions', 'results', 'sessionSummaries', 'resultSummaries', 'meta'],
    'readonly',
  )
  const missing: ProjectionRepair[] = []
  const result: DailyStatusesRead = await commitTransaction(transaction, async () => {
    const snapshot = await readState(transaction)
    const statuses: DailyVariantStatus[] = []
    for (const variant of SUDOKU_VARIANTS) {
      const id = getDailyFormalId(date, variant)
      const saved = await transaction.objectStore('sessionSummaries').get(id)
      const result = await transaction.objectStore('resultSummaries').get(id)
      const session = saved === undefined ? null : readProjection(saved, 'sessions', missing)
      const completed = result === undefined ? null : readProjection(result, 'results', missing)
      if (missing.length > 0) {
        return { ...snapshot, coverage: 'pending', statuses: [] }
      }
      let state: DailyVariantStatus['state'] = 'available'
      if (session?.completedAt || completed) {
        state = 'completed'
      } else {
        const missingSession =
          !session && (await transaction.objectStore('sessions').getKey(id)) !== undefined
        const missingResult = (await transaction.objectStore('results').getKey(id)) !== undefined
        if (missingSession) {
          missing.push({ kind: 'sessions', id })
        }
        if (missingResult) {
          missing.push({ kind: 'results', id })
        }
        if (missing.length > 0) {
          return { ...snapshot, coverage: 'pending', statuses: [] }
        }
        if (session) {
          state = 'in-progress'
        }
      }
      statuses.push({ variant, state })
    }
    return { ...snapshot, coverage: 'ready', statuses }
  })
  if (missing.length > 0) {
    result.generation = await invalidateProjectionCoverage(db, result, missing)
  }
  return result
}

export async function readOverview(
  db: IDBPDatabase<SudokuDatabase>,
  variant: SudokuVariant,
  today: string,
): Promise<OverviewRead> {
  if (!isChallengeDate(today)) {
    throw new TypeError('Invalid overview date')
  }
  const transaction = db.transaction(['sessionSummaries', 'resultSummaries', 'meta'], 'readonly')
  const repairs: ProjectionRepair[] = []
  const result: OverviewRead = await commitTransaction(transaction, async () => {
    const snapshot = await readState(transaction, 'results')
    if (snapshot.coverage === 'pending') {
      return { ...snapshot, summary: null, completedCount: null }
    }
    const summary: RecordSummary = {
      freeBests: {
        easy: { assisted: null, unassisted: null },
        medium: { assisted: null, unassisted: null },
        hard: { assisted: null, unassisted: null },
        expert: { assisted: null, unassisted: null },
      },
      dailyTotals: { assisted: 0, unassisted: 0 },
      currentStreak: 0,
      longestStreak: 0,
    }
    const dayMs = 86400000
    const eligible = new Set<number>()
    let completedCount = 0
    let cursor = await transaction
      .objectStore('resultSummaries')
      .index('by-variant-order')
      .openCursor(prefixRange([variant]))
    while (cursor) {
      const result = readProjection(cursor.value, 'results', repairs)
      if (!result) {
        return { ...snapshot, coverage: 'pending', summary: null, completedCount: null }
      }
      completedCount++
      const classification = result.assisted ? 'assisted' : 'unassisted'
      if (result.mode === 'free') {
        const best = summary.freeBests[result.difficulty][classification]
        summary.freeBests[result.difficulty][classification] =
          best === null ? result.elapsedMs : Math.min(best, result.elapsedMs)
      }
      if (result.metadata.kind === 'daily' && result.metadata.formalAttempt && result.completedAt) {
        summary.dailyTotals[classification]++
        const date = result.metadata.challengeDate
        if (date <= today && getChallengeDate(new Date(result.completedAt)) === date) {
          eligible.add(Date.parse(`${date}T00:00:00Z`) / dayMs)
        }
      }
      cursor = await cursor.continue()
    }
    let previous: number | null = null
    let run = 0
    for (const day of [...eligible].sort((first, second) => first - second)) {
      run = previous !== null && day === previous + 1 ? run + 1 : 1
      summary.longestStreak = Math.max(summary.longestStreak, run)
      previous = day
    }
    let day = Date.parse(`${today}T00:00:00Z`) / dayMs
    if (!eligible.has(day)) {
      day--
    }
    while (eligible.has(day)) {
      summary.currentStreak++
      day--
    }
    return { ...snapshot, summary, completedCount }
  })
  if (repairs.length > 0) {
    result.generation = await invalidateProjectionCoverage(db, result, repairs)
  }
  return result
}

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
      const parsed =
        captured.key === undefined
          ? null
          : kind === 'sessions'
            ? parseSessionRecord(captured.raw, validators)
            : parseResultRecord(captured.raw, validators)
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
    ...(await readState(transaction)),
    processed,
  }))
}
