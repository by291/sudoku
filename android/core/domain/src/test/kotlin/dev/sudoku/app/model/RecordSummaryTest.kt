package dev.sudoku.app.model

import kotlin.test.Test
import kotlin.test.assertEquals

class RecordSummaryTest {
    @Test fun `streaming streaks deduplicate days and retain the first and longest runs`() {
        val statistics = StreakStatistics(100)

        listOf(100L, 99L, 99L, 97L, 96L, 95L).forEach(statistics::include)

        assertEquals(StreakSummary(current = 2, longest = 3), statistics.summary())
    }

    @Test fun `daily totals retain assistance and streak uses Beijing completion date`() {
        fun completed(date: String, completedAt: String, assisted: Boolean): ResultRecord {
            val session =
                createSession(
                    puzzleFixture(),
                    SessionMetadata.Daily(date, true),
                    "daily:$date:formal",
                    "${date}T00:00:00.000Z"
                )
            return ResultRecord(
                session = session.copy(
                    elapsedMs = 200,
                    completion = Completion(completedAt, 200),
                    assistance = Assistance(assisted = assisted)
                )
            )
        }
        val results =
            listOf(
                completed("2026-10-14", "2026-10-14T15:59:00.000Z", false),
                completed("2026-10-15", "2026-10-15T15:59:00.000Z", true),
                completed("2026-10-16", "2026-10-16T16:00:00.000Z", false)
            )

        val summary = summarizeRecords(results, "2026-10-16")

        assertEquals(DailyTotals(assisted = 1, unassisted = 2), summary.dailyTotals)
        assertEquals(2, summary.currentStreak)
        assertEquals(2, summary.longestStreak)
    }

    @Test fun `free best times are variant specific and duplicate original results count once`() {
        val session = createSession(
            puzzleFixture(),
            SessionMetadata.Free,
            "free",
            "2026-10-16T01:02:03.004Z"
        ).copy(elapsedMs = 750, completion = Completion("2026-10-16T01:02:04.000Z", 750))
        val otherVariant = session.copy(
            id = "diagonal",
            puzzle = session.puzzle.copy(rules = PuzzleRules.Diagonal),
            elapsedMs = 100
        )

        val summary =
            summarizeRecords(
                listOf(
                    ResultRecord(session = session),
                    ResultRecord(session = session.copy(elapsedMs = 50)),
                    ResultRecord(session = otherVariant)
                ),
                "2026-10-16"
            )

        assertEquals(750, summary.freeBests.getValue(Difficulty.EASY).unassisted)
        assertEquals(null, summary.freeBests.getValue(Difficulty.EASY).assisted)
    }
}
