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
    @Test fun themeRetryRetainsTheRequestedThemeWithoutRepeatingBootstrap() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val reads = StartupReads().also { it.gate.complete(Unit) }
            var fail = true
            val updates = mutableListOf<dev.sudoku.app.model.SettingsUpdate>()
            val repository = object : GameRepository by unsupported(GameRepository::class.java) {
                override suspend fun readDatasetEpoch() = StorageOutcome.Success(0L)

                override suspend fun readSettings() = StorageOutcome.Success(Settings())

                override suspend fun updateSettings(
                    update: dev.sudoku.app.model.SettingsUpdate,
                    expectedEpoch: Long
                ): StorageOutcome<Settings> {
                    updates += update
                    return if (fail) {
                        StorageOutcome.Failure(StorageFailure(StorageFailureKind.WRITE_FAILED, "Disk"))
                    } else {
                        StorageOutcome.Success(Settings(theme = dev.sudoku.app.model.ThemePreference.DARK))
                    }
                }
            }
            val model = AppViewModel(repository, reads)
            runCurrent()
            model.setTheme(dev.sudoku.app.model.ThemePreference.DARK)
            runCurrent()

            fail = false
            model.retry()
            runCurrent()

            org.junit.Assert.assertEquals(2, updates.size)
            org.junit.Assert.assertEquals(dev.sudoku.app.model.ThemePreference.DARK, model.uiState.value.settings.theme)
            org.junit.Assert.assertEquals(1, reads.calls)
        } finally {
            Dispatchers.resetMain()
        }
    }

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
    var calls = 0

    override suspend fun readBootstrap(): StorageOutcome<BootstrapSnapshot> {
        calls++
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
