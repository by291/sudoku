package dev.sudoku.app.game

import dev.sudoku.app.model.BootstrapSnapshot
import dev.sudoku.app.model.GameReadRepository
import dev.sudoku.app.model.GameRepository
import dev.sudoku.app.model.HomePresence
import dev.sudoku.app.model.Settings
import dev.sudoku.app.model.StorageFailure
import dev.sudoku.app.model.StorageFailureKind
import dev.sudoku.app.model.StorageOutcome
import java.lang.reflect.Proxy
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GameEntryControllerTest {
    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    @Test
    fun anOlderRefreshCannotRepublishAfterDatasetReplacement() = runTest {
        val reads = EntryReads()
        reads.bootstrap.value = BootstrapSnapshot(0, Settings(), HomePresence(true, false, "old"))
        val loader = GameEntryController(reads, unusedRepository(), backgroundScope)
        val release = kotlinx.coroutines.CompletableDeferred<Unit>()
        reads.gate = release
        val old = launch { loader.prepareHome() }
        runCurrent()

        loader.invalidate(1)
        reads.gate = null
        reads.bootstrap.value = BootstrapSnapshot(1, Settings(), HomePresence(false, false))
        loader.prepareHome()
        release.complete(Unit)
        old.join()

        org.junit.Assert.assertEquals(1L, loader.uiState.value.epoch)
        assertFalse(loader.uiState.value.hasSaves)
        org.junit.Assert.assertNull(loader.uiState.value.singleSaveId)
    }

    @Test fun changedDatasetDropsOldPresenceEvenWhenTheRefreshFails() = runTest {
        val reads = EntryReads()
        reads.bootstrap.value = BootstrapSnapshot(0, Settings(), HomePresence(true, false, "old-save"))
        val loader = GameEntryController(reads, unusedRepository(), backgroundScope)

        loader.invalidate(1)
        reads.fail = true
        loader.prepareHome()

        assertFalse(loader.uiState.value.hasSaves)
        assertFalse(loader.uiState.value.hasLoadedSnapshot)
        org.junit.Assert.assertNull(loader.uiState.value.singleSaveId)
        assertTrue(loader.uiState.value.error != null)
    }

    @Test fun initialHomeReusesPresenceWithoutFetchingSheetsOrDetails() = runTest {
        val reads = EntryReads()
        reads.bootstrap.value = BootstrapSnapshot(0, Settings(), HomePresence(true, false))
        val loader = GameEntryController(reads, unusedRepository(), backgroundScope)

        assertTrue(loader.uiState.value.hasSaves)
        assertTrue(loader.uiState.value.hasLoadedSnapshot)
        assertFalse(loader.uiState.value.loading)
        assertTrue(loader.uiState.value.saves.isEmpty())
    }

    @Test fun pendingMigrationKeepsContinueAndRefreshFailureRetainsKnownPresence() = runTest {
        val reads = EntryReads()
        reads.bootstrap.value = BootstrapSnapshot(0, Settings(), HomePresence(false, true))
        val loader = GameEntryController(reads, unusedRepository(), backgroundScope)

        reads.fail = true
        loader.prepareHome()

        assertTrue(loader.uiState.value.hasSaves)
        assertTrue(loader.uiState.value.error != null)
    }
}

private class EntryReads :
    GameReadRepository by (
        Proxy.newProxyInstance(
            GameReadRepository::class.java.classLoader,
            arrayOf(GameReadRepository::class.java)
        ) { _, method, _ -> error("Unexpected entry read: ${method.name}") } as GameReadRepository
        ) {
    override val bootstrap = MutableStateFlow<BootstrapSnapshot?>(null)
    var gate: kotlinx.coroutines.CompletableDeferred<Unit>? = null
    var fail = false

    override suspend fun readBootstrap(): StorageOutcome<BootstrapSnapshot> = if (fail) {
        StorageOutcome.Failure(StorageFailure(StorageFailureKind.UNAVAILABLE, "Unavailable"))
    } else {
        val snapshot = checkNotNull(bootstrap.value)
        gate?.await()
        StorageOutcome.Success(snapshot)
    }
}

private fun unusedRepository() = Proxy.newProxyInstance(
    GameRepository::class.java.classLoader,
    arrayOf(GameRepository::class.java)
) { _, method, _ ->
    if (method.name == "getDatasetEpochs") {
        kotlinx.coroutines.flow.emptyFlow<Long>()
    } else {
        error("Unexpected repository operation: ${method.name}")
    }
} as GameRepository
