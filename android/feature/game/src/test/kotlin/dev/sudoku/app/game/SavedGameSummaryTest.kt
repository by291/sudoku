package dev.sudoku.app.game

import dev.sudoku.app.model.Difficulty
import dev.sudoku.app.model.GameSession
import dev.sudoku.app.model.GameSummary
import dev.sudoku.app.model.Puzzle
import dev.sudoku.app.model.PuzzleRules
import dev.sudoku.app.model.SessionMetadata
import dev.sudoku.app.model.createSession
import dev.sudoku.app.model.variant
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Test

class SavedGameSummaryTest {
    private val solution = List(81) { cell -> ((cell / 9) * 3 + (cell / 9) / 3 + cell % 9) % 9 + 1 }
    private val puzzle = Puzzle(
        solution.mapIndexed { cell, digit -> if (cell < 2) 0 else digit },
        solution,
        PuzzleRules.Classic,
        Difficulty.MEDIUM,
        "00".repeat(32),
        "sudoku-v11"
    )

    @Test
    fun countsEnteredEmptyCellsWithoutClaimingTheyAreCorrectOrCountingNotes() {
        val session = createSession(puzzle, SessionMetadata.Free, "free", "2026-10-16T17:20:00.000Z").copy(
            entries = List(81) { if (it == 0) 8 else 0 },
            notes = List(81) { if (it == 1) 511 else 0 },
            elapsedMs = 512_000
        )

        val summary = session.savedGameSummary(ZoneId.of("Asia/Shanghai"), 2026)

        assertEquals("标准数独", summary.title)
        assertEquals("中等", summary.difficulty)
        assertEquals("普通对局", summary.source)
        assertEquals("已填 1 / 2 · 08:32", summary.progress)
        assertEquals("10-17 01:20 开始", summary.startedAt)
    }

    @Test
    fun keepsTheYearForSavesFromAnotherYear() {
        val session = createSession(puzzle, SessionMetadata.Free, "older", "2025-10-16T17:20:00.000Z")

        val summary = session.savedGameSummary(ZoneId.of("UTC"), 2026)

        assertEquals("2025-10-16 17:20 开始", summary.startedAt)
    }

    @Test
    fun distinguishesFormalDailyPracticeAndLearningSources() {
        val sources = listOf(
            SessionMetadata.Daily("2026-10-16", true) to "每日挑战 · 2026-10-16 · 正式",
            SessionMetadata.Daily("2026-10-16", false) to "每日挑战 · 2026-10-16 · 练习",
            SessionMetadata.Learning("rules") to "课程练习"
        )

        for ((metadata, expected) in sources) {
            val session = createSession(puzzle, metadata, "saved", "2026-10-16T17:20:00.000Z")
            val summary = session.savedGameSummary(ZoneId.of("UTC"), 2026)

            assertEquals(expected, listOfNotNull(summary.source, summary.sourceDetail).joinToString(" · "))
            assertEquals("10-16 17:20 开始", summary.startedAt)
        }
    }
}

private fun GameSession.savedGameSummary(zone: java.time.ZoneId, year: Int): SavedGameSummary {
    val cells = puzzle.givens.indices.filter { puzzle.givens[it] == 0 }
    return GameSummary(
        id, 1, puzzle.rules.variant, puzzle.difficulty, metadata,
        startedAt, elapsedMs, completion, assistance.assisted, cells.count { entries[it] != 0 }, cells.size
    )
        .savedGameSummary(zone, year)
}
