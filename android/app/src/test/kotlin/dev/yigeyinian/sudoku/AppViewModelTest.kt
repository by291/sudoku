package dev.yigeyinian.sudoku

import dev.yigeyinian.sudoku.game.GameEntryLoader
import dev.yigeyinian.sudoku.model.EngineInformation
import dev.yigeyinian.sudoku.model.EngineOutcome
import dev.yigeyinian.sudoku.model.GameRepository
import dev.yigeyinian.sudoku.model.ResultRecord
import dev.yigeyinian.sudoku.model.SessionRecord
import dev.yigeyinian.sudoku.model.Settings
import dev.yigeyinian.sudoku.model.StorageFailure
import dev.yigeyinian.sudoku.model.StorageFailureKind
import dev.yigeyinian.sudoku.model.StorageOutcome
import dev.yigeyinian.sudoku.model.SudokuEngine
import java.lang.reflect.Proxy
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AppViewModelTest {
    @Test
    fun waitsForConcurrentSettingsAndSavedGamesBeforeOpeningHome() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val repository = StartupRepository()
            val model = AppViewModel(startupEngine(), repository, GameEntryLoader(repository))
            runCurrent()

            assertTrue(repository.settingsStarted)
            assertTrue(repository.sessionsStarted)
            assertTrue(repository.resultsStarted)
            assertFalse(model.uiState.value.ready)
            repository.settingsGate.complete(Unit)
            runCurrent()
            assertFalse(model.uiState.value.ready)
            repository.savesGate.complete(Unit)
            runCurrent()

            assertTrue(model.uiState.value.ready)
            assertFalse(model.uiState.value.loading)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun failedSaveReadKeepsHomeClosedAndCanBeRetried() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val repository = StartupRepository()
            repository.settingsGate.complete(Unit)
            repository.savesGate.complete(Unit)
            repository.sessions = StorageOutcome.Failure(StorageFailure(StorageFailureKind.UNAVAILABLE, "Unavailable"))
            val model = AppViewModel(startupEngine(), repository, GameEntryLoader(repository))
            runCurrent()

            assertFalse(model.uiState.value.ready)
            assertFalse(model.uiState.value.loading)
            assertNotNull(model.uiState.value.error)

            repository.sessions = StorageOutcome.Success(emptyList())
            model.retry()
            runCurrent()

            assertTrue(model.uiState.value.ready)
            assertFalse(model.uiState.value.loading)
        } finally {
            Dispatchers.resetMain()
        }
    }
}

private class StartupRepository : GameRepository by startupStub(GameRepository::class.java) {
    val settingsGate = CompletableDeferred<Unit>()
    val savesGate = CompletableDeferred<Unit>()
    var settingsStarted = false
    var sessionsStarted = false
    var resultsStarted = false
    var sessions: StorageOutcome<List<SessionRecord>> = StorageOutcome.Success(emptyList())

    override suspend fun readSettings(): StorageOutcome<Settings> {
        settingsStarted = true
        settingsGate.await()
        return StorageOutcome.Success(Settings())
    }

    override suspend fun listSessions(): StorageOutcome<List<SessionRecord>> {
        sessionsStarted = true
        savesGate.await()
        return sessions
    }

    override suspend fun listResults(): StorageOutcome<List<ResultRecord>> {
        resultsStarted = true
        savesGate.await()
        return StorageOutcome.Success(emptyList())
    }
}

private fun startupEngine(): SudokuEngine = object : SudokuEngine by startupStub(SudokuEngine::class.java) {
    override suspend fun information() = EngineOutcome.Completed(
        EngineInformation("1", "sudoku-v11", "sudoku-variants-v11", "sudoku-rating-v2")
    )
}

private fun <T> startupStub(type: Class<T>): T = type.cast(
    Proxy.newProxyInstance(type.classLoader, arrayOf(type)) { _, method, _ ->
        throw UnsupportedOperationException(method.name)
    }
)
