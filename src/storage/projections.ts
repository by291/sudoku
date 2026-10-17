import type { IDBPTransaction } from 'idb'
import type { SudokuDatabase } from '@/storage/database'
import type { GameSession } from '@/features/game/model/session'
import type { GameSummary, SummaryQueryKind } from '@/storage/readModels'
import { isRecord } from '@/sudoku/values'
import { SUDOKU_VARIANTS } from '@/sudoku/catalogue'
import {
  isIdentifier,
  isIsoInstant,
  isNonnegativeInteger,
  parseSessionMetadata,
} from '@/storage/records'

export type StoredSummary = GameSummary & { orderTime: number; unfinished: number }
export type SummaryState = {
  generation: number
  sessions: { complete: boolean; after: string | null }
  results: { complete: boolean; after: string | null }
}
export type ProjectionTransaction = IDBPTransaction<
  SudokuDatabase,
  (
    | 'sessions'
    | 'results'
    | 'sessionSummaries'
    | 'resultSummaries'
    | 'quarantine'
    | 'leases'
    | 'meta'
    | 'lessons'
  )[],
  'readwrite'
>

export function initialSummaryState(complete: boolean): SummaryState {
  return {
    generation: 1,
    sessions: { complete, after: null },
    results: { complete, after: null },
  }
}

export function parseSummaryState(value: unknown): SummaryState {
  if (!isRecord(value) || !isNonnegativeInteger(value.generation)) {
    throw new TypeError('Invalid summary coverage')
  }
  const state = initialSummaryState(false)
  state.generation = value.generation
  for (const kind of ['sessions', 'results'] as const) {
    const source = value[kind]
    if (
      !isRecord(source) ||
      typeof source.complete !== 'boolean' ||
      !(source.after === null || isIdentifier(source.after))
    ) {
      throw new TypeError('Invalid summary coverage')
    }
    state[kind] = { complete: source.complete, after: source.after }
  }
  return state
}

export function summaryStore(kind: SummaryQueryKind) {
  return kind === 'sessions' ? 'sessionSummaries' : 'resultSummaries'
}

export function projectRecord(
  session: GameSession,
  revision: number,
  kind: SummaryQueryKind,
): StoredSummary {
  let filledCount = 0
  let fillableCount = 0
  for (const [cell, given] of session.puzzle.givens.entries()) {
    if (given === 0) {
      fillableCount++
      if (session.entries[cell] !== 0) {
        filledCount++
      }
    }
  }

  return {
    id: session.id,
    revision,
    mode: session.mode,
    variant: session.puzzle.rules.kind,
    difficulty: session.puzzle.difficulty,
    metadata: { ...session.metadata },
    startedAt: session.startedAt,
    elapsedMs: session.elapsedMs,
    completedAt: session.completion?.completedAt ?? null,
    assisted: session.assistance.assisted,
    filledCount,
    fillableCount,
    // Negative milliseconds retain newest-first ordering with ascending ID tie breaks.
    orderTime: -Date.parse(
      kind === 'sessions'
        ? session.startedAt
        : (session.completion?.completedAt ?? session.startedAt),
    ),
    unfinished: session.completion ? 0 : 1,
  }
}

export class InvalidStoredSummary extends Error {}

export function parseSummary(value: unknown, kind: SummaryQueryKind): StoredSummary {
  if (
    !isRecord(value) ||
    !isIdentifier(value.id) ||
    !isNonnegativeInteger(value.revision) ||
    !(value.mode === 'free' || value.mode === 'daily' || value.mode === 'learning') ||
    !isIsoInstant(value.startedAt) ||
    !isNonnegativeInteger(value.elapsedMs) ||
    !(value.completedAt === null || isIsoInstant(value.completedAt)) ||
    typeof value.assisted !== 'boolean' ||
    !isNonnegativeInteger(value.filledCount) ||
    !isNonnegativeInteger(value.fillableCount) ||
    value.fillableCount > 81 ||
    value.filledCount > value.fillableCount ||
    !isRecord(value.metadata) ||
    value.metadata.kind !== value.mode
  ) {
    throw new InvalidStoredSummary('Invalid stored summary; rebuild local summaries')
  }

  const metadata = parseSessionMetadata(value.metadata)
  if (!metadata || (kind === 'results' && value.completedAt === null)) {
    throw new InvalidStoredSummary('Invalid stored summary metadata')
  }

  const variant = SUDOKU_VARIANTS.find((candidate) => candidate === value.variant)
  const difficulty = value.difficulty
  if (
    !variant ||
    !(
      difficulty === 'easy' ||
      difficulty === 'medium' ||
      difficulty === 'hard' ||
      difficulty === 'expert'
    )
  ) {
    throw new InvalidStoredSummary('Invalid summary puzzle identity')
  }

  const orderTime = -Date.parse(kind === 'sessions' ? value.startedAt : (value.completedAt ?? ''))
  if (value.orderTime !== orderTime || value.unfinished !== (value.completedAt === null ? 1 : 0)) {
    throw new InvalidStoredSummary('Invalid summary index fields')
  }

  return {
    id: value.id,
    revision: value.revision,
    mode: value.mode,
    variant,
    difficulty,
    metadata,
    startedAt: value.startedAt,
    elapsedMs: value.elapsedMs,
    completedAt: value.completedAt,
    assisted: value.assisted,
    filledCount: value.filledCount,
    fillableCount: value.fillableCount,
    orderTime,
    unfinished: value.completedAt === null ? 1 : 0,
  }
}

export async function advanceSummaryGeneration(
  transaction: ProjectionTransaction,
): Promise<SummaryState> {
  const state = parseSummaryState(await transaction.objectStore('meta').get('summaries'))
  state.generation++
  if (!Number.isSafeInteger(state.generation)) {
    throw new TypeError('Summary generation exhausted')
  }
  await transaction.objectStore('meta').put(state, 'summaries')
  return state
}
