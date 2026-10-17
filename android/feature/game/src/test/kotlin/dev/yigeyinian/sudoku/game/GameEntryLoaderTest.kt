package dev.yigeyinian.sudoku.game

import dev.yigeyinian.sudoku.model.Difficulty
import dev.yigeyinian.sudoku.model.GameRepository
import dev.yigeyinian.sudoku.model.Puzzle
import dev.yigeyinian.sudoku.model.PuzzleRules
import dev.yigeyinian.sudoku.model.ResultRecord
import dev.yigeyinian.sudoku.model.SessionMetadata
import dev.yigeyinian.sudoku.model.SessionRecord
import dev.yigeyinian.sudoku.model.StorageFailure
import dev.yigeyinian.sudoku.model.StorageFailureKind
import dev.yigeyinian.sudoku.model.StorageOutcome
import dev.yigeyinian.sudoku.model.Variant
import dev.yigeyinian.sudoku.model.createSession
import dev.yigeyinian.sudoku.model.dailyFormalId
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GameEntryLoaderTest {
    @Test
    fun readsAllSavesAndCompletionRecordsConcurrentlyAndPublishesTogether() = runTest {
        val repository = EntryRepository()
        repository.sessionsGate = CompletableDeferred()
        repository.resultsGate = CompletableDeferred()
        val loader = GameEntryLoader(repository)

        val load = async { loader.prepareHome() }
        runCurrent()

        assertEquals(1, repository.sessionReads)
        assertEquals(1, repository.resultReads)
        assertFalse(loader.uiState.value.hasLoadedSnapshot)
        repository.sessionsGate?.complete(Unit)
        runCurrent()
        assertFalse(loader.uiState.value.hasLoadedSnapshot)
        repository.resultsGate?.complete(Unit)
        assertTrue(load.await() is StorageOutcome.Success)
        assertEquals(
            listOf("free-save", dailyFormalId("2026-10-17", Variant.CLASSIC)),
            loader.uiState.value.sessions.map { it.session.id }
        )
        assertFalse(loader.uiState.value.loading)
    }

    @Test
    fun retainsThePreviousSnapshotWhenOneParallelReadFails() = runTest {
        val repository = EntryRepository()
        val loader = GameEntryLoader(repository)
        loader.prepareHome()
        val saved = loader.uiState.value.sessions
        repository.sessions = emptyList()
        repository.results = StorageOutcome.Failure(StorageFailure(StorageFailureKind.UNAVAILABLE, "Unavailable"))

        assertTrue(loader.prepareHome() is StorageOutcome.Failure)

        assertEquals(saved, loader.uiState.value.sessions)
        assertTrue(loader.uiState.value.hasLoadedSnapshot)
        assertFalse(loader.uiState.value.loading)
        assertTrue(loader.uiState.value.error != null)
    }

    @Test
    fun cancellationDoesNotPublishPartialDataOrLeaveLoadingStuck() = runTest {
        val repository = EntryRepository()
        repository.resultsGate = CompletableDeferred()
        val loader = GameEntryLoader(repository)
        val load = async { loader.prepareHome() }
        runCurrent()

        load.cancel()
        load.join()

        assertFalse(loader.uiState.value.hasLoadedSnapshot)
        assertFalse(loader.uiState.value.loading)
        repository.resultsGate = null
        assertTrue(loader.prepareHome() is StorageOutcome.Success)
    }

    @Test
    fun firstHomeEntryReusesPreloadAndReturningRefreshesIt() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val repository = EntryRepository()
            val loader = GameEntryLoader(repository)
            loader.prepareHome()
            val model = GameEntryViewModel(loader)

            model.open()
            runCurrent()
            assertEquals(1, repository.sessionReads)
            assertFalse(model.uiState.value.loading)
            model.open()
            runCurrent()

            assertEquals(2, repository.sessionReads)
            assertEquals(2, repository.resultReads)
        } finally {
            Dispatchers.resetMain()
        }
    }
}

private class EntryRepository : GameRepository by unsupportedEntryRepository() {
    var sessionReads = 0
    var resultReads = 0
    var sessionsGate: CompletableDeferred<Unit>? = null
    var resultsGate: CompletableDeferred<Unit>? = null
    var sessions = entryFixtures()
    var results: StorageOutcome<List<ResultRecord>> = StorageOutcome.Success(emptyList())

    override suspend fun listSessions(): StorageOutcome<List<SessionRecord>> {
        sessionReads += 1
        sessionsGate?.await()
        return StorageOutcome.Success(sessions)
    }

    override suspend fun listResults(): StorageOutcome<List<ResultRecord>> {
        resultReads += 1
        resultsGate?.await()
        return results
    }
}

private fun entryFixtures(): List<SessionRecord> {
    val solution = List(81) { ((it / 9) * 3 + (it / 9) / 3 + it % 9) % 9 + 1 }
    val puzzle = Puzzle(
        solution.mapIndexed { cell, digit -> if (cell == 0) 0 else digit },
        solution,
        PuzzleRules.Classic,
        Difficulty.EASY,
        "00".repeat(32),
        "sudoku-v11"
    )
    val timestamp = "2026-10-17T00:00:00.000Z"
    return listOf(
        SessionRecord(revision = 0, session = createSession(puzzle, SessionMetadata.Free, "free-save", timestamp)),
        SessionRecord(
            revision = 0,
            session = createSession(
                puzzle,
                SessionMetadata.Daily("2026-10-17", true),
                dailyFormalId("2026-10-17", Variant.CLASSIC),
                timestamp
            )
        )
    )
}

private fun unsupportedEntryRepository(): GameRepository = java.lang.reflect.Proxy.newProxyInstance(
    GameRepository::class.java.classLoader,
    arrayOf(GameRepository::class.java)
) { _, method, _ -> throw UnsupportedOperationException(method.name) } as GameRepository
