import { getChallengeDate } from '@/features/game/model/daily'
import type { GameSummary, RecordSummary } from '@/storage/readModels'

const DAY_MS = 86400000

/**
 * Aggregates validated result projections for a validated challenge date.
 * The reader owns variant filtering and ID uniqueness; no records or browser services are retained.
 */
export class ResultStatistics {
  private readonly freeBests: RecordSummary['freeBests'] = {
    easy: { assisted: null, unassisted: null },
    medium: { assisted: null, unassisted: null },
    hard: { assisted: null, unassisted: null },
    expert: { assisted: null, unassisted: null },
  }
  private readonly dailyTotals: RecordSummary['dailyTotals'] = { assisted: 0, unassisted: 0 }
  private readonly eligibleDays = new Set<number>()
  private completedCount = 0

  constructor(private readonly today: string) {}

  add(result: GameSummary): void {
    this.completedCount++
    const classification = result.assisted ? 'assisted' : 'unassisted'
    if (result.mode === 'free') {
      const best = this.freeBests[result.difficulty][classification]
      this.freeBests[result.difficulty][classification] =
        best === null ? result.elapsedMs : Math.min(best, result.elapsedMs)
    }

    if (result.metadata.kind === 'daily' && result.metadata.formalAttempt && result.completedAt) {
      this.dailyTotals[classification]++
      const date = result.metadata.challengeDate
      // A late formal finish still counts as a result, but only the Beijing challenge day earns a streak.
      if (date <= this.today && getChallengeDate(new Date(result.completedAt)) === date) {
        this.eligibleDays.add(Date.parse(`${date}T00:00:00Z`) / DAY_MS)
      }
    }
  }

  /** Returns owned statistics without exposing the accumulator's mutable state. */
  summarize(): { summary: RecordSummary; completedCount: number } {
    let previous: number | null = null
    let run = 0
    let longestStreak = 0
    for (const day of [...this.eligibleDays].sort((first, second) => first - second)) {
      run = previous !== null && day === previous + 1 ? run + 1 : 1
      longestStreak = Math.max(longestStreak, run)
      previous = day
    }

    let day = Date.parse(`${this.today}T00:00:00Z`) / DAY_MS
    if (!this.eligibleDays.has(day)) {
      day--
    }
    let currentStreak = 0
    while (this.eligibleDays.has(day)) {
      currentStreak++
      day--
    }

    return {
      summary: {
        freeBests: {
          easy: { ...this.freeBests.easy },
          medium: { ...this.freeBests.medium },
          hard: { ...this.freeBests.hard },
          expert: { ...this.freeBests.expert },
        },
        dailyTotals: { ...this.dailyTotals },
        currentStreak,
        longestStreak,
      },
      completedCount: this.completedCount,
    }
  }
}
