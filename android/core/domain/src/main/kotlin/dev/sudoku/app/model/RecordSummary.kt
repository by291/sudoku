package dev.sudoku.app.model

import java.time.Instant
import java.time.LocalDate

data class BestTimes(val assisted: Long? = null, val unassisted: Long? = null)

data class DailyTotals(val assisted: Int = 0, val unassisted: Int = 0)

data class RecordSummary(
    val freeBests: Map<Difficulty, BestTimes>,
    val dailyTotals: DailyTotals,
    val currentStreak: Int,
    val longestStreak: Int
)

fun summarizeRecords(results: List<ResultRecord>, today: String, variant: Variant = Variant.CLASSIC): RecordSummary {
    require(isChallengeDate(today))
    val statistics = RecordStatistics()
    val seen = mutableSetOf<String>()
    val eligibleDays = mutableSetOf<Long>()

    for (record in results) {
        val session = record.session
        val completion = session.completion ?: continue
        if (session.puzzle.rules.variant != variant || !seen.add(session.id)) {
            continue
        }
        val assisted = session.assistance.assisted
        if (session.mode == GameMode.FREE) {
            statistics.includeFree(session.puzzle.difficulty, assisted, session.elapsedMs)
        }
        val metadata = session.metadata
        if (metadata is SessionMetadata.Daily && metadata.formalAttempt) {
            statistics.includeFormalDaily(assisted)

            // A completion after Beijing midnight counts in totals but cannot create a streak day.
            val eligibleDate = eligibleChallengeDate(metadata, Instant.parse(completion.completedAt))
            if (eligibleDate != null && eligibleDate <= today) {
                eligibleDays += LocalDate.parse(eligibleDate).toEpochDay()
            }
        }
    }

    val streak = summarizeStreak(eligibleDays, LocalDate.parse(today).toEpochDay())
    return statistics.summary(streak)
}

/** Day numbers use the challenge calendar; a current streak may end yesterday. */
data class StreakSummary(val current: Int, val longest: Int)

fun summarizeStreak(eligibleDays: Set<Long>, today: Long): StreakSummary {
    val statistics = StreakStatistics(today)
    eligibleDays.sortedDescending().forEach(statistics::include)
    return statistics.summary()
}

/** Consumes eligible epoch-day numbers no later than today, in descending order, without retaining history. */
class StreakStatistics(private val today: Long) {
    private var previousDay: Long? = null
    private var run = 0
    private var longest = 0
    private var current = 0
    private var currentRunOpen = false

    fun include(day: Long) {
        require(day <= today) { "Future dates cannot contribute to challenge streaks" }
        val previous = previousDay
        require(previous == null || day <= previous) { "Streak dates must descend" }
        if (day == previous) {
            return
        }

        val consecutive = previous != null && day == previous - 1
        run = if (consecutive) run + 1 else 1
        longest = maxOf(longest, run)
        if (previous == null) {
            currentRunOpen = day == today || day == today - 1
        } else if (!consecutive) {
            currentRunOpen = false
        }
        if (currentRunOpen) {
            current++
        }
        previousDay = day
    }

    fun summary(): StreakSummary = StreakSummary(current, longest)
}

/** Shared accumulation policy for canonical result fixtures and compact storage aggregates. */
class RecordStatistics {
    private val bests = Difficulty.entries.associateWith { BestTimes() }.toMutableMap()
    private var assistedDaily = 0
    private var unassistedDaily = 0

    fun includeFree(difficulty: Difficulty, assisted: Boolean, elapsedMs: Long) {
        val previous = bests.getValue(difficulty)
        bests[difficulty] = if (assisted) {
            previous.copy(assisted = minOf(previous.assisted ?: Long.MAX_VALUE, elapsedMs))
        } else {
            previous.copy(unassisted = minOf(previous.unassisted ?: Long.MAX_VALUE, elapsedMs))
        }
    }

    fun includeFormalDaily(assisted: Boolean, count: Int = 1) {
        if (assisted) {
            assistedDaily += count
        } else {
            unassistedDaily += count
        }
    }

    fun summary(streak: StreakSummary): RecordSummary = RecordSummary(
        bests.toMap(),
        DailyTotals(assistedDaily, unassistedDaily),
        streak.current,
        streak.longest
    )
}
