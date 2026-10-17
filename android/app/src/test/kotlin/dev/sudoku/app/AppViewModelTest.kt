package dev.sudoku.app

import dev.sudoku.app.model.BootstrapSnapshot
import dev.sudoku.app.model.GameReadRepository
import dev.sudoku.app.model.GameRepository
import dev.sudoku.app.model.HomePresence
import dev.sudoku.app.model.Settings
import dev.sudoku.app.model.StorageFailure
import dev.sudoku.app.model.StorageFailureKind
import dev.sudoku.app.model.StorageOutcome
import java.lang.reflect.Proxy
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
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
    @Test fun homeRequiresOnlyTheSmallSnapshotAndDoesNotStartMaintenance() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val reads = StartupReads()
            // Every old full-list/settings/learning call fails instead of hiding accidental work.
            val model = AppViewModel(unsupported(GameRepository::class.java), reads)
            runCurrent()
            assertFalse(model.uiState.value.ready)

            reads.gate.complete(Unit)
            runCurrent()

            assertTrue(model.uiState.value.ready)
            assertFalse(model.uiState.value.loading)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test fun failedEssentialReadKeepsHomeClosedAndCanRetry() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val reads = StartupReads()
            reads.gate.complete(Unit)
            reads.fail = true
            val model = AppViewModel(unsupported(GameRepository::class.java), reads)
            runCurrent()
            assertFalse(model.uiState.value.ready)
            assertNotNull(model.uiState.value.error)

            reads.fail = false
            model.retry()
            runCurrent()

            assertTrue(model.uiState.value.ready)
        } finally {
            Dispatchers.resetMain()
        }
    }
}

private class StartupReads : GameReadRepository by unsupported(GameReadRepository::class.java) {
    override val bootstrap = MutableStateFlow<BootstrapSnapshot?>(null)
    val gate = CompletableDeferred<Unit>()
    var fail = false
    override suspend fun readBootstrap(): StorageOutcome<BootstrapSnapshot> {
        gate.await()
        if (fail) return StorageOutcome.Failure(StorageFailure(StorageFailureKind.UNAVAILABLE, "Offline"))
        return StorageOutcome.Success(BootstrapSnapshot(0, Settings(), HomePresence(false, false)))
    }
}

private fun <T> unsupported(type: Class<T>): T = type.cast(
    Proxy.newProxyInstance(type.classLoader, arrayOf(type)) {
            _,
            method,
            _
        ->
        error("Unexpected startup work: ${method.name}")
    }
)
