package dev.yigeyinian.sudoku.model

import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SessionSemanticsTest {
    @Test fun `undo restores layers but never reverses assistance`() {
        val session = createSession(puzzleFixture(), SessionMetadata.Free, "attempt", "2026-10-16T01:02:03.004Z")
        val entries = session.entries.toMutableList().also { it[0] = 5 }
        val edited = commitBoardEdit(
            session,
            EditResult(entries, session.notes, true, false),
            BoardEdit.Enter(0, 5)
        ).session
        val helped = applySessionAction(edited, SessionFactAction.HINT_SHOWN).session

        val undone = applySessionAction(helped, SessionFactAction.UNDO).session

        assertEquals(0, undone.entries[0])
        assertEquals(1, undone.assistance.hintCount)
        assertTrue(undone.assistance.assisted)
        assertEquals(5, applySessionAction(undone, SessionFactAction.REDO).session.entries[0])
    }

    @Test fun `daily identity uses Beijing date and classic historical spelling`() {
        assertEquals("2026-10-17", challengeDate(Instant.parse("2026-10-16T16:00:00Z")))
        assertEquals("daily:2026-10-16:formal", dailyFormalId("2026-10-16", Variant.CLASSIC))
        assertEquals("daily:killer:2026-10-16:formal", dailyFormalId("2026-10-16", Variant.KILLER))
        assertEquals(19, Variant.entries.sumOf { it.difficulties.size })
        assertFalse(Difficulty.EXPERT in Variant.ARROW.difficulties)
    }

    @Test fun `monotonic running intervals settle once and restoration remains paused`() {
        val clock = SessionClock(400)
        clock.resume(1000)
        assertEquals(650, clock.elapsedAt(1250))
        assertEquals(800, clock.pause(1400))
        assertEquals(800, clock.pause(1900))
        assertEquals(800, clock.elapsedAt(3000))
    }
}

fun puzzleFixture() = Puzzle(
    List(81) {
        0
    },
    List(81) {
        (it * 3 + it / 9 + it / 27) % 9 + 1
    },
    PuzzleRules.Classic,
    Difficulty.EASY,
    "01".repeat(32),
    "sudoku-v11"
)
