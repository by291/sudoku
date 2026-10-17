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
    val bests = Difficulty.entries.associateWith { BestTimes() }.toMutableMap()
    var assistedDaily = 0
    var unassistedDaily = 0
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
            val previous = bests.getValue(session.puzzle.difficulty)
            bests[session.puzzle.difficulty] =
                if (assisted) {
                    previous.copy(assisted = minOf(previous.assisted ?: Long.MAX_VALUE, session.elapsedMs))
                } else {
                    previous.copy(unassisted = minOf(previous.unassisted ?: Long.MAX_VALUE, session.elapsedMs))
                }
        }
        val metadata = session.metadata
        if (metadata is SessionMetadata.Daily && metadata.formalAttempt) {
            if (assisted) {
                assistedDaily++
            } else {
                unassistedDaily++
            }
            // A completion after Beijing midnight counts in totals but cannot create a streak day.
            if (metadata.challengeDate <= today &&
                challengeDate(Instant.parse(completion.completedAt)) == metadata.challengeDate
            ) {
                eligibleDays += LocalDate.parse(metadata.challengeDate).toEpochDay()
            }
        }
    }

    var previousDay: Long? = null
    var run = 0
    var longest = 0
    for (day in eligibleDays.sorted()) {
        run = if (previousDay != null && day == previousDay + 1) run + 1 else 1
        longest = maxOf(longest, run)
        previousDay = day
    }
    var day = LocalDate.parse(today).toEpochDay()
    if (day !in eligibleDays) {
        day--
    }
    var current = 0
    while (day in eligibleDays) {
        current++
        day--
    }
    return RecordSummary(bests, DailyTotals(assistedDaily, unassistedDaily), current, longest)
}
