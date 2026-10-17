package dev.yigeyinian.sudoku.model

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Test

class ChallengeRefreshTest {
    @Test fun refreshWakesAtBeijingMidnightRatherThanOneMinuteAfterOpening() {
        assertEquals(500L, challengeRefreshDelay(Instant.parse("2026-10-17T15:59:59.500Z")))
        assertEquals(60_000L, challengeRefreshDelay(Instant.parse("2026-10-17T16:00:00Z")))
        assertEquals("2026-10-18", challengeDate(Instant.parse("2026-10-17T16:00:00Z")))
    }
}
