import type { IDBPDatabase, IDBPTransaction } from 'idb'
import type { SudokuDatabase, SummaryIndexes } from '@/storage/database'
import { commitTransaction } from '@/storage/database'
import { StorageConflict } from '@/storage/ownership'
import { SUDOKU_VARIANTS } from '@/sudoku/catalogue'
import type { SudokuVariant } from '@/sudoku/contracts'
import { getDailyFormalId, isChallengeDate } from '@/features/game/model/daily'
import type { DailyVariantStatus } from '@/features/game/model/daily'
import { isIdentifier } from '@/storage/records'
import type {
  CompletionCountsRead,
  DailyStatusesRead,
  HomeRead,
  OverviewRead,
  SlotSummaryRead,
  SummaryPage,
  SummaryPageQuery,
} from '@/storage/readModels'
import { SUMMARY_PAGE_SIZE } from '@/storage/readModels'
import { summaryStore } from '@/storage/projections'
import {
  invalidateProjectionCoverage,
  readProjection,
  readSummarySnapshot,
} from '@/storage/summaryCoverage'
import type { ProjectionRepair } from '@/storage/summaryCoverage'
import { ResultStatistics } from '@/storage/summaryStatistics'

const CATALOGUE_STORES = [
  // Coverage must come from the same transaction as the projections it describes.
  'sessionSummaries',
  'resultSummaries',
  'meta',
] as const

function prefixRange(prefix: (string | number)[], after?: [number, string]): IDBKeyRange {
  const lowerBound = after ? [...prefix, ...after] : prefix
  // An array sorts after the scalar ordering keys. Resume strictly after the last time/ID pair.
  const upperBound = [...prefix, []]

  return IDBKeyRange.bound(lowerBound, upperBound, after !== undefined)
}

/** Reads compact home counts from one committed projection snapshot. */
export async function readHome(db: IDBPDatabase<SudokuDatabase>): Promise<HomeRead> {
  const transaction = db.transaction(CATALOGUE_STORES, 'readonly')
  return commitTransaction(transaction, async () => {
    const snapshot = await readSummarySnapshot(transaction)
    if (snapshot.coverage === 'pending') {
      return {
        ...snapshot,
        unfinishedCount: null,
        resultCount: null,
      }
    }

    const unfinishedCount = await transaction
      .objectStore('sessionSummaries')
      .index('by-unfinished-order')
      .count(prefixRange([1]))
    const resultCount = await transaction.objectStore('resultSummaries').count()

    return {
      ...snapshot,
      unfinishedCount,
      resultCount,
    }
  })
}

/** Counts completed games for every variant without opening saved boards. */
export async function readCompletionCounts(
  db: IDBPDatabase<SudokuDatabase>,
): Promise<CompletionCountsRead> {
  const transaction = db.transaction(['resultSummaries', 'meta'], 'readonly')
  return commitTransaction(transaction, async () => {
    const snapshot = await readSummarySnapshot(transaction, 'results')
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

/** Reads one ordered page, rejecting cursors from another filter or dataset snapshot. */
export async function readSummaryPage(
  db: IDBPDatabase<SudokuDatabase>,
  query: SummaryPageQuery,
): Promise<SummaryPage> {
  const transaction = db.transaction(CATALOGUE_STORES, 'readonly')
  const repairs: ProjectionRepair[] = []
  const result: SummaryPage = await commitTransaction(transaction, async () => {
    const snapshot = await readSummarySnapshot(transaction, query.kind)
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
      return {
        ...snapshot,
        rows: [],
        nextCursor: null,
      }
    }

    const { index, prefix } = queryIndex(query)
    const store = transaction.objectStore(summaryStore(query.kind))
    const range = prefixRange(prefix, cursor ? [cursor.time, cursor.id] : undefined)

    // One lookahead key decides whether to issue a cursor without a separate count.
    const raw = await store.index(index).getAll(range, SUMMARY_PAGE_SIZE + 1)

    const rows = []
    for (const value of raw.slice(0, SUMMARY_PAGE_SIZE)) {
      const row = readProjection(value, query.kind, repairs)
      if (!row) {
        return {
          ...snapshot,
          coverage: 'pending',
          rows: [],
          nextCursor: null,
        }
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

/** Resolves one active slot using canonical keys and its compact projection. */
export async function readSlotSummary(
  db: IDBPDatabase<SudokuDatabase>,
  mode: 'free' | 'learning',
  variant?: SudokuVariant,
): Promise<SlotSummaryRead> {
  const transaction = db.transaction(
    [
      // Canonical keys can establish absence even when the derived store is incomplete.
      'sessions',
      'sessionSummaries',
      'meta',
    ],
    'readonly',
  )
  const missing: ProjectionRepair[] = []
  const result: SlotSummaryRead = await commitTransaction(transaction, async () => {
    const snapshot = await readSummarySnapshot(transaction, 'sessions')
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
      return {
        ...snapshot,
        coverage: 'ready',
        summary: null,
      }
    }

    const raw = await transaction.objectStore('sessionSummaries').get(key)
    if (raw === undefined) {
      missing.push({ kind: 'sessions', id: key })
      return {
        ...snapshot,
        coverage: 'pending',
        summary: null,
      }
    }

    const summary = readProjection(raw, 'sessions', missing)
    return {
      ...snapshot,
      coverage: summary ? 'ready' : 'pending',
      summary,
    }
  })

  if (missing.length > 0) {
    result.generation = await invalidateProjectionCoverage(db, result, missing)
  }

  return result
}

type DailyReadTransaction = IDBPTransaction<
  SudokuDatabase,
  ('sessions' | 'results' | 'sessionSummaries' | 'resultSummaries' | 'meta')[],
  'readonly'
>

async function readFormalAttempt(
  transaction: DailyReadTransaction,
  id: string,
  missing: ProjectionRepair[],
): Promise<DailyVariantStatus['state'] | null> {
  const saved = await transaction.objectStore('sessionSummaries').get(id)
  const result = await transaction.objectStore('resultSummaries').get(id)
  const session = saved === undefined ? null : readProjection(saved, 'sessions', missing)
  const completed = result === undefined ? null : readProjection(result, 'results', missing)
  if (missing.length > 0) {
    return null
  }

  // A retained completion is sufficient proof that the formal attempt is no longer available.
  if (session?.completedAt || completed) {
    return 'completed'
  }

  // Check canonical keys before treating missing projections as an available attempt.
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
    return null
  }

  return session ? 'in-progress' : 'available'
}

/** Reads formal-attempt statuses without opening canonical boards. */
export async function readDailyStatuses(
  db: IDBPDatabase<SudokuDatabase>,
  date: string,
): Promise<DailyStatusesRead> {
  if (!isChallengeDate(date)) {
    throw new TypeError('Invalid challenge date')
  }

  const transaction = db.transaction(
    [
      // Canonical keys distinguish genuinely absent attempts from missing projections.
      'sessions',
      'results',
      ...CATALOGUE_STORES,
    ],
    'readonly',
  )
  const missing: ProjectionRepair[] = []
  const result: DailyStatusesRead = await commitTransaction(transaction, async () => {
    const snapshot = await readSummarySnapshot(transaction)

    const statuses: DailyVariantStatus[] = []
    for (const variant of SUDOKU_VARIANTS) {
      const id = getDailyFormalId(date, variant)
      const state = await readFormalAttempt(transaction, id, missing)
      if (state === null) {
        return {
          ...snapshot,
          coverage: 'pending',
          statuses: [],
        }
      }

      statuses.push({ variant, state })
    }

    return {
      ...snapshot,
      coverage: 'ready',
      statuses,
    }
  })

  if (missing.length > 0) {
    result.generation = await invalidateProjectionCoverage(db, result, missing)
  }

  return result
}

/** Aggregates validated result projections for one variant and challenge date. */
export async function readOverview(
  db: IDBPDatabase<SudokuDatabase>,
  variant: SudokuVariant,
  today: string,
): Promise<OverviewRead> {
  if (!isChallengeDate(today)) {
    throw new TypeError('Invalid overview date')
  }

  const transaction = db.transaction(CATALOGUE_STORES, 'readonly')
  const repairs: ProjectionRepair[] = []
  const result: OverviewRead = await commitTransaction(transaction, async () => {
    const snapshot = await readSummarySnapshot(transaction, 'results')
    if (snapshot.coverage === 'pending') {
      return {
        ...snapshot,
        summary: null,
        completedCount: null,
      }
    }

    const statistics = new ResultStatistics(today)
    let cursor = await transaction
      .objectStore('resultSummaries')
      .index('by-variant-order')
      .openCursor(prefixRange([variant]))
    while (cursor) {
      const result = readProjection(cursor.value, 'results', repairs)
      if (!result) {
        return {
          ...snapshot,
          coverage: 'pending',
          summary: null,
          completedCount: null,
        }
      }

      statistics.add(result)
      cursor = await cursor.continue()
    }

    return { ...snapshot, ...statistics.summarize() }
  })

  if (repairs.length > 0) {
    result.generation = await invalidateProjectionCoverage(db, result, repairs)
  }

  return result
}
