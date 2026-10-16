package dev.yigeyinian.sudoku.game

import dev.yigeyinian.sudoku.model.Difficulty
import dev.yigeyinian.sudoku.model.GameSession
import dev.yigeyinian.sudoku.model.Puzzle
import dev.yigeyinian.sudoku.model.PuzzleRules
import dev.yigeyinian.sudoku.model.SessionMetadata
import dev.yigeyinian.sudoku.model.SessionRecord
import dev.yigeyinian.sudoku.model.StorageFailure
import dev.yigeyinian.sudoku.model.StorageFailureKind
import dev.yigeyinian.sudoku.model.StorageOutcome
import dev.yigeyinian.sudoku.model.createSession
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SessionWriterTest {
    private fun session(): GameSession = createSession(
        Puzzle(
            List(81) {
                0
            },
            List(81) { it % 9 + 1 },
            PuzzleRules.Classic,
            Difficulty.EASY,
            "00".repeat(32),
            "sudoku-v11"
        ),
        SessionMetadata.Free,
        "writer-session",
        "2026-10-16T00:00:00.000Z"
    )

    @Test
    fun `later input stages immediately while an earlier snapshot is saving`() = runTest {
        val firstWrite = CompletableDeferred<Unit>()
        val calls = mutableListOf<Pair<Long, GameSession>>()
        val writer = SessionWriter(backgroundScope, 3) { snapshot, revision ->
            calls += revision to snapshot
            if (calls.size == 1) firstWrite.await()
            StorageOutcome.Success(SessionRecord(revision = revision + 1, session = snapshot))
        }

        writer.stage(session())
        runCurrent()
        writer.stage(session().copy(elapsedMs = 10))
        writer.stage(session().copy(elapsedMs = 20))
        firstWrite.complete(Unit)
        writer.flush()

        assertEquals(listOf(3L, 4L), calls.map { it.first })
        assertEquals(listOf(0L, 20L), calls.map { it.second.elapsedMs })
        assertEquals(5L, writer.revision)
        assertFalse(writer.state.value.dirty)
    }

    @Test
    fun `failed writes retain the newest snapshot for explicit retry`() = runTest {
        var fail = true
        val writer = SessionWriter(backgroundScope, 0) { snapshot, revision ->
            if (fail) {
                StorageOutcome.Failure(StorageFailure(StorageFailureKind.WRITE_FAILED, "disk full"))
            } else {
                StorageOutcome.Success(SessionRecord(revision = revision + 1, session = snapshot))
            }
        }

        writer.stage(session())
        runCurrent()

        assertTrue(writer.state.value.dirty)
        assertNotNull(writer.state.value.failure)
        assertEquals(0L, writer.revision)

        fail = false
        assertTrue(writer.flush())
        assertEquals(1L, writer.revision)
        assertFalse(writer.state.value.dirty)
    }

    @Test
    fun `invalidation prevents a late write from adopting a replacement dataset`() = runTest {
        val release = CompletableDeferred<Unit>()
        val writer = SessionWriter(backgroundScope, 1) { snapshot, revision ->
            release.await()
            StorageOutcome.Success(SessionRecord(revision = revision + 1, session = snapshot))
        }

        writer.stage(session())
        runCurrent()
        writer.invalidate()
        release.complete(Unit)
        advanceUntilIdle()

        assertEquals(1L, writer.revision)
        assertFalse(writer.flush())
        assertFalse(writer.state.value.dirty)
    }

    @Test
    fun `save snapshots own mutable input lists`() = runTest {
        val values = MutableList(81) { 0 }
        var received: GameSession? = null
        val writer = SessionWriter(backgroundScope, 0) { snapshot, revision ->
            received = snapshot
            StorageOutcome.Success(SessionRecord(revision = revision + 1, session = snapshot))
        }

        writer.stage(session().copy(entries = values))
        values[0] = 9
        writer.flush()

        assertEquals(0, received?.entries?.first())
    }
}
