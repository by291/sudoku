import type { Difficulty } from '@/sudoku/contracts'
import type { ResultRecord, SessionRecord } from '@/storage/records'
import type { GameSession } from '@/features/game/model/session'
import type { SudokuVariant } from '@/sudoku/contracts'
import { getChallengeDate, isChallengeDate } from '@/features/game/model/daily'

export type RecordSummary = {
  freeBests: Record<Difficulty, { assisted: number | null; unassisted: number | null }>
  dailyTotals: { assisted: number; unassisted: number }
  currentStreak: number
  longestStreak: number
}

const DAY_MS = 86400000
const sessionStartFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export type SaveSummary = {
  filledCount: number
  fillableCount: number
  progressLabel: string
  startedAtLabel: string
}

/** Describes validated saved layers without assessing correctness or counting candidate notes. */
export function summarizeSave(session: GameSession): SaveSummary {
  let filledCount = 0
  let fillableCount = 0
  for (const [cell, given] of session.puzzle.givens.entries()) {
    if (given !== 0) {
      continue
    }

    fillableCount++
    if (session.entries[cell] !== 0) {
      filledCount++
    }
  }

  return {
    filledCount,
    fillableCount,
    progressLabel: `已填 ${filledCount} / ${fillableCount} 格`,
    startedAtLabel: sessionStartFormatter.format(new Date(session.startedAt)),
  }
}

/** Returns a new list; equal start times retain the same order across repository reads. */
export function sortSavedSessions(sessions: readonly SessionRecord[]): SessionRecord[] {
  return [...sessions].sort((first, second) => {
    const startedDifference =
      Date.parse(second.session.startedAt) - Date.parse(first.session.startedAt)
    if (startedDifference !== 0) {
      return startedDifference
    }

    if (first.session.id === second.session.id) {
      return 0
    }

    return first.session.id < second.session.id ? -1 : 1
  })
}

export type CompletionDateGroup = { date: string; label: string; records: ResultRecord[] }

/** Groups validated completion facts by display-local dates, independently of daily eligibility. */
export function groupCompletedRecords(results: readonly ResultRecord[]): CompletionDateGroup[] {
  const groups = new Map<string, CompletionDateGroup>()
  const sorted = [...results].sort((first, second) =>
    (second.session.completion?.completedAt ?? '').localeCompare(
      first.session.completion?.completedAt ?? '',
    ),
  )

  for (const result of sorted) {
    if (!result.session.completion) {
      continue
    }

    const completed = new Date(result.session.completion.completedAt)
    const date = `${completed.getFullYear()}-${String(completed.getMonth() + 1).padStart(2, '0')}-${String(completed.getDate()).padStart(2, '0')}`
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

    group.records.push(result)
  }

  return [...groups.values()]
}

export function variantSaves(sessions: readonly SessionRecord[], variant: SudokuVariant) {
  const sorted = sortSavedSessions(
    sessions.filter(({ session }) => session.puzzle.rules.kind === variant),
  )
  const latest = sorted.find(({ session }) => session.completion === null) ?? null

  return { latest, others: sorted.filter((record) => record !== latest) }
}

export function summarizeRecords(
  results: readonly ResultRecord[],
  today: string,
  variant: SudokuVariant = 'classic',
): RecordSummary {
  if (!isChallengeDate(today)) {
    throw new TypeError('Invalid summary date')
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
  const seen = new Set<string>()
  const eligible = new Set<number>()

  for (const { session } of results) {
    if (session.puzzle.rules.kind !== variant) {
      continue
    }

    if (seen.has(session.id) || !session.completion) {
      continue
    }

    seen.add(session.id)
    const classification = session.assistance.assisted ? 'assisted' : 'unassisted'
    if (session.mode === 'free') {
      const best = summary.freeBests[session.puzzle.difficulty][classification]
      summary.freeBests[session.puzzle.difficulty][classification] =
        best === null ? session.elapsedMs : Math.min(best, session.elapsedMs)
    }

    if (session.metadata.kind === 'daily' && session.metadata.formalAttempt) {
      summary.dailyTotals[classification]++
      const date = session.metadata.challengeDate
      if (date <= today && getChallengeDate(new Date(session.completion.completedAt)) === date) {
        eligible.add(Date.parse(`${date}T00:00:00Z`) / DAY_MS)
      }
    }
  }

  let previous: number | null = null
  let run = 0

  for (const day of [...eligible].sort((a, b) => a - b)) {
    run = previous !== null && day === previous + 1 ? run + 1 : 1
    summary.longestStreak = Math.max(summary.longestStreak, run)
    previous = day
  }

  let day = Date.parse(`${today}T00:00:00Z`) / DAY_MS
  if (!eligible.has(day)) {
    day--
  }

  while (eligible.has(day)) {
    summary.currentStreak++
    day--
  }

  return summary
}

export function sessionLink(session: GameSession): string {
  const query = `variant=${session.puzzle.rules.kind}&session=${encodeURIComponent(session.id)}`
  if (session.metadata.kind === 'learning') {
    return `/learn/${encodeURIComponent(session.metadata.lessonId)}?practice=1&${query}`
  }

  return `/play/${session.mode === 'daily' ? 'daily' : 'free'}?${query}`
}

export function modeName(session: GameSession): string {
  if (session.metadata.kind === 'daily') {
    return `${session.metadata.challengeDate} · ${session.metadata.formalAttempt ? '每日正式挑战' : '每日练习'}`
  }

  return session.mode === 'learning' ? '学习实战' : '自由游玩'
}
