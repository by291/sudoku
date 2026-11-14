package dev.sudoku.app

import dev.sudoku.app.model.BootstrapSnapshot
import dev.sudoku.app.model.GameReadRepository
import dev.sudoku.app.model.GameRepository
import dev.sudoku.app.model.HomePresence
import dev.sudoku.app.model.Settings
import dev.sudoku.app.model.SettingsUpdate
import dev.sudoku.app.model.StorageFailure
import dev.sudoku.app.model.StorageFailureKind
import dev.sudoku.app.model.StorageOutcome
import dev.sudoku.app.model.ThemePreference
import java.lang.reflect.Proxy
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AppViewModelTest {
    @Test
    fun themeRetryRetainsTheRequestedThemeWithoutRepeatingBootstrap() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val reads = StartupReads().also { it.gate.complete(Unit) }
            var fail = true
            val updates = mutableListOf<SettingsUpdate>()
            val repository = object : GameRepository by unsupported(GameRepository::class.java) {
                override suspend fun readDatasetEpoch() = StorageOutcome.Success(0L)

                override suspend fun readSettings() = StorageOutcome.Success(Settings())

                override suspend fun updateSettings(
                    update: SettingsUpdate,
                    expectedEpoch: Long
                ): StorageOutcome<Settings> {
                    updates += update
                    return if (fail) {
                        StorageOutcome.Failure(
                            StorageFailure(StorageFailureKind.WRITE_FAILED, "Disk")
                        )
                    } else {
                        StorageOutcome.Success(Settings(theme = ThemePreference.DARK))
                    }
                }
            }
            val model = AppViewModel(repository, reads)
            runCurrent()
            model.setTheme(ThemePreference.DARK)
            runCurrent()

            fail = false
            model.retry()
            runCurrent()

            assertEquals(2, updates.size)
            assertEquals(ThemePreference.DARK, model.uiState.value.settings.theme)
            assertEquals(1, reads.calls)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun homeRequiresOnlyTheSmallSnapshotAndDoesNotStartMaintenance() = runTest {
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

    @Test
    fun failedEssentialReadKeepsHomeClosedAndCanRetry() = runTest {
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

    @Test
    fun oldThemeCompletionCannotPublishAfterDatasetReloadStarts() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val reads = StartupReads().also { it.gate.complete(Unit) }
            val writeStarted = CompletableDeferred<Long>()
            val finishWrite = CompletableDeferred<Unit>()
            val repository = object : GameRepository by unsupported(GameRepository::class.java) {
                override suspend fun updateSettings(
                    update: SettingsUpdate,
                    expectedEpoch: Long
                ): StorageOutcome<Settings> {
                    writeStarted.complete(expectedEpoch)
                    finishWrite.await()
                    return StorageOutcome.Success(Settings(theme = ThemePreference.DARK))
                }
            }
            val model = AppViewModel(repository, reads)
            runCurrent()

            model.setTheme(ThemePreference.DARK)
            runCurrent()
            val originalEpoch = writeStarted.await()
            val restored = Settings(theme = ThemePreference.LIGHT, showTimer = false)
            reads.snapshot = BootstrapSnapshot(1, restored, HomePresence(false, false))
            val reloading = launch { model.reloadSettings() }
            runCurrent()
            finishWrite.complete(Unit)
            reloading.join()

            assertEquals(0L, originalEpoch)
            assertEquals(restored, model.uiState.value.settings)
            assertEquals(null, model.uiState.value.themeFailure)
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
    var snapshot = BootstrapSnapshot(0, Settings(), HomePresence(false, false))

    override suspend fun readBootstrap(): StorageOutcome<BootstrapSnapshot> {
        calls++
        gate.await()
        if (fail) {
            return StorageOutcome.Failure(StorageFailure(StorageFailureKind.UNAVAILABLE, "Offline"))
        }

        return StorageOutcome.Success(snapshot)
    }
}

private fun <T : Any> unsupported(type: Class<T>): T = checkNotNull(
    type.cast(
        Proxy.newProxyInstance(type.classLoader, arrayOf(type)) {
                _,
                method,
                _
            ->
            error("Unexpected startup work: ${method.name}")
        }
    )
)
