import type { Difficulty } from '@/core/sudoku/types'
import type { ResultRecord } from '@/storage/records'
import type { GameSession } from '@/features/game/model/session'
import { getChallengeDate, isChallengeDate } from '@/features/game/model/daily'
export type RecordSummary = {
  freeBests: Record<Difficulty, { assisted: number | null; unassisted: number | null }>
  dailyTotals: { assisted: number; unassisted: number }
  currentStreak: number
  longestStreak: number
}
const DAY_MS = 86400000
export function summarizeRecords(results: readonly ResultRecord[], today: string): RecordSummary {
  if (!isChallengeDate(today)) throw new TypeError('Invalid summary date')
  const summary: RecordSummary = {
    freeBests: {
      easy: { assisted: null, unassisted: null },
      medium: { assisted: null, unassisted: null },
      hard: { assisted: null, unassisted: null },
    },
    dailyTotals: { assisted: 0, unassisted: 0 },
    currentStreak: 0,
    longestStreak: 0,
  }
  const seen = new Set<string>(),
    eligible = new Set<number>()
  for (const { session } of results) {
    if (seen.has(session.id) || !session.completion) continue
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
      if (date <= today && getChallengeDate(new Date(session.completion.completedAt)) === date)
        eligible.add(Date.parse(`${date}T00:00:00Z`) / DAY_MS)
    }
  }
  let previous: number | null = null,
    run = 0
  for (const day of [...eligible].sort((a, b) => a - b)) {
    run = previous !== null && day === previous + 1 ? run + 1 : 1
    summary.longestStreak = Math.max(summary.longestStreak, run)
    previous = day
  }
  let day = Date.parse(`${today}T00:00:00Z`) / DAY_MS
  if (!eligible.has(day)) day--
  while (eligible.has(day)) {
    summary.currentStreak++
    day--
  }
  return summary
}
export function sessionLink(session: GameSession): string {
  const query = `session=${encodeURIComponent(session.id)}`
  if (session.metadata.kind === 'learning')
    return `/learn/${encodeURIComponent(session.metadata.lessonId)}?practice=1&${query}`
  return `/play/${session.mode === 'daily' ? 'daily' : 'free'}?${query}`
}
export function modeName(session: GameSession): string {
  if (session.metadata.kind === 'daily')
    return `${session.metadata.challengeDate} · ${session.metadata.formalAttempt ? '每日正式挑战' : '每日练习'}`
  return session.mode === 'learning' ? '学习实战' : '自由游玩'
}
