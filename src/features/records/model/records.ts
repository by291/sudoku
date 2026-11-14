import type { GameSummary } from '@/storage/readModels'
import type { GameSession } from '@/features/game/model/session'

const sessionStartFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const completionTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
})

export type SaveSummary = {
  filledCount: number
  fillableCount: number
  progressLabel: string
  startedAtLabel: string
}

/** Returns the route for reopening a saved game in its original mode. */
export function sessionLink(session: GameSession | GameSummary): string {
  const variant = 'variant' in session ? session.variant : session.puzzle.rules.kind
  const query = `variant=${variant}&session=${encodeURIComponent(session.id)}`
  if (session.metadata.kind === 'learning') {
    return `/learn/${encodeURIComponent(session.metadata.lessonId)}?practice=1&${query}`
  }

  return `/play/${session.mode === 'daily' ? 'daily' : 'free'}?${query}`
}

/** Formats the player-facing name of the session mode. */
export function modeName(session: Pick<GameSession, 'mode' | 'metadata'>): string {
  if (session.metadata.kind === 'daily') {
    const label = session.metadata.formalAttempt ? '每日正式挑战' : '每日练习'

    return `${session.metadata.challengeDate} · ${label}`
  }

  return session.mode === 'learning' ? '学习实战' : '自由游玩'
}

/** Formats a compact projection without opening or validating its full saved board. */
export function summarizeProjection(summary: GameSummary): SaveSummary {
  return {
    filledCount: summary.filledCount,
    fillableCount: summary.fillableCount,
    progressLabel: `已填 ${summary.filledCount} / ${summary.fillableCount} 格`,
    startedAtLabel: sessionStartFormatter.format(new Date(summary.startedAt)),
  }
}

/** Formats the local time of a completed game. */
export function formatCompletionTime(completedAt: string | null): string {
  return completedAt ? completionTimeFormatter.format(new Date(completedAt)) : ''
}

/** Groups a page of completed records by local calendar date while retaining their order. */
export function groupCompletedSummaries(rows: readonly GameSummary[]) {
  const groups = new Map<string, { date: string; label: string; records: GameSummary[] }>()
  for (const row of rows) {
    if (!row.completedAt) {
      continue
    }

    const completed = new Date(row.completedAt)
    const year = completed.getFullYear()
    const month = String(completed.getMonth() + 1).padStart(2, '0')
    const day = String(completed.getDate()).padStart(2, '0')
    const date = `${year}-${month}-${day}`

    let group = groups.get(date)
    if (!group) {
      group = {
        date,
        label: completed.toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        records: [],
      }
      groups.set(date, group)
    }

    group.records.push(row)
  }

  return [...groups.values()]
}
