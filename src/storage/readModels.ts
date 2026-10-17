import type { GameMode, SessionMetadata } from '@/features/game/model/session'
import type { DailyVariantStatus } from '@/features/game/model/daily'
import type { Difficulty, SudokuVariant } from '@/sudoku/contracts'

export type SummaryCoverage = 'ready' | 'pending'

/** Compact presentation facts; never authorize editing or destructive decisions. */
export type GameSummary = {
  id: string
  /** Session revision; immutable result snapshots use zero. */
  revision: number
  mode: GameMode
  variant: SudokuVariant
  difficulty: Difficulty
  metadata: SessionMetadata
  startedAt: string
  elapsedMs: number
  completedAt: string | null
  assisted: boolean
  filledCount: number
  fillableCount: number
}

export type SummarySnapshot = {
  coverage: SummaryCoverage
  epoch: number
  generation: number
}

export type SummaryQueryKind = 'sessions' | 'results'
/** Pass back unchanged; time is the internal negative-millisecond ordering key. */
export type SummaryCursor = {
  epoch: number
  generation: number
  kind: SummaryQueryKind
  variant: SudokuVariant | null
  mode: GameMode | null
  unfinishedOnly: boolean
  time: number
  id: string
}

export type SummaryPageQuery = {
  kind: SummaryQueryKind
  variant?: SudokuVariant
  mode?: GameMode
  unfinishedOnly?: boolean
  cursor?: SummaryCursor | null
}

export type SummaryPage = SummarySnapshot & {
  rows: readonly GameSummary[]
  nextCursor: SummaryCursor | null
}

export type HomeRead = SummarySnapshot & {
  unfinishedCount: number | null
  resultCount: number | null
}

export type CompletionCountsRead = SummarySnapshot & {
  counts: Record<SudokuVariant, number> | null
}

export type SlotSummaryRead = SummarySnapshot & { summary: GameSummary | null }
export type DailyStatusesRead = SummarySnapshot & { statuses: readonly DailyVariantStatus[] }
export type RecordSummary = {
  freeBests: Record<Difficulty, { assisted: number | null; unassisted: number | null }>
  dailyTotals: { assisted: number; unassisted: number }
  currentStreak: number
  longestStreak: number
}
export type OverviewRead = SummarySnapshot & {
  summary: RecordSummary | null
  completedCount: number | null
}
export type SummaryMaintenance = SummarySnapshot & { processed: number }

export const SUMMARY_PAGE_SIZE = 30
