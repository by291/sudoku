package dev.sudoku.app.feature.records

import androidx.lifecycle.SavedStateHandle
import dev.sudoku.app.model.BackupExport
import dev.sudoku.app.model.BackupPreview
import dev.sudoku.app.model.EditorToken
import dev.sudoku.app.model.GameRepository
import dev.sudoku.app.model.GameSession
import dev.sudoku.app.model.LessonProgress
import dev.sudoku.app.model.LocalBackup
import dev.sudoku.app.model.PreviousSession
import dev.sudoku.app.model.SessionRecord
import dev.sudoku.app.model.Settings
import dev.sudoku.app.model.SettingsUpdate
import dev.sudoku.app.model.StorageFailure
import dev.sudoku.app.model.StorageFailureKind
import dev.sudoku.app.model.StorageOutcome
import dev.sudoku.app.model.SummaryQuery
import dev.sudoku.app.model.updated
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain

@OptIn(ExperimentalCoroutinesApi::class)
class RecordsViewModelTest {
    @Test fun `successful count refresh preserves the failed export document retry`() = runTest {
        verifyExportRetryAfterCount(failCount = false)
    }

    @Test fun `failed count refresh preserves the failed export storage kind and document retry`() = runTest {
        verifyExportRetryAfterCount(failCount = true)
    }

    private suspend fun kotlinx.coroutines.test.TestScope.verifyExportRetryAfterCount(failCount: Boolean) {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val repository = RecordsRepositoryFake().also { it.failExport = true }
            val model = RecordsViewModel(repository, recordReads(repository), SavedStateHandle())
            assertNull(model.prepareExport())
            runCurrent()
            assertEquals(StorageFailureKind.WRITE_FAILED, model.uiState.value.backupFailure?.storage?.kind)
            repository.failCount = failCount

            model.openBackup()
            runCurrent()

            assertEquals(StorageFailureKind.WRITE_FAILED, model.uiState.value.backupFailure?.storage?.kind)
            assertEquals(BackupDocumentAction.EXPORT, model.retryBackup())
            repository.failExport = false
            assertNotNull(model.prepareExport())
            runCurrent()

            assertEquals(2, repository.exportCalls)
            assertEquals(1, repository.countCalls)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test fun `opening backup metadata retains the captured failed clear operation`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val repository = RecordsRepositoryFake().also { it.failClear = true }
            val model = RecordsViewModel(repository, recordReads(repository), SavedStateHandle())
            model.refresh()
            runCurrent()
            model.clearAll()
            runCurrent()
            assertEquals(StorageFailureKind.WRITE_FAILED, model.uiState.value.backupFailure?.storage?.kind)

            model.openBackup()
            runCurrent()
            repository.failClear = false
            model.retryBackup()
            runCurrent()

            assertEquals(listOf(1L, 1L), repository.clearEpochs)
            assertEquals(1L, model.uiState.value.replacementGeneration)
            assertNull(model.uiState.value.backupFailure)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test fun `recreated query choices use the saved tab and variant without retaining page payloads`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val repository = RecordsRepositoryFake()
            val queries = mutableListOf<dev.sudoku.app.model.SummaryQuery>()
            val reads = object : dev.sudoku.app.model.GameReadRepository by recordReads(repository) {
                override suspend fun readPage(
                    query: dev.sudoku.app.model.SummaryQuery,
                    cursor: dev.sudoku.app.model.SummaryCursor?
                ): StorageOutcome<dev.sudoku.app.model.SummaryPage> {
                    queries += query
                    return StorageOutcome.Success(dev.sudoku.app.model.SummaryPage(1, emptyList(), null, false))
                }
            }
            val saved = SavedStateHandle()
            val original = RecordsViewModel(repository, reads, saved)
            original.selectTab(RecordsTab.HISTORY)
            original.selectVariant(dev.sudoku.app.model.Variant.ARROW)
            runCurrent()
            val restoredChoices = saved.keys().associateWith { saved.get<String>(it) }

            val recreated = RecordsViewModel(repository, reads, SavedStateHandle(restoredChoices))
            recreated.refresh()
            runCurrent()

            assertEquals(RecordsTab.HISTORY, recreated.uiState.value.tab)
            assertEquals(dev.sudoku.app.model.Variant.ARROW, recreated.uiState.value.variant)
            assertEquals(SummaryQuery.History(dev.sudoku.app.model.Variant.ARROW), queries.last())
            assertEquals(setOf("records.tab", "records.variant"), saved.keys())
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test fun `query and backup failures retain their storage kinds and independent retries`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val repository = RecordsRepositoryFake()
            var queryFails = true
            val reads = object : dev.sudoku.app.model.GameReadRepository by recordReads(repository) {
                override suspend fun readOverview(
                    variant: dev.sudoku.app.model.Variant,
                    today: String
                ): StorageOutcome<dev.sudoku.app.model.OverviewSnapshot> = if (queryFails) {
                    StorageOutcome.Failure(StorageFailure(StorageFailureKind.UNAVAILABLE, "Offline"))
                } else {
                    recordReads(repository).readOverview(variant, today)
                }
            }
            val model = RecordsViewModel(repository, reads, SavedStateHandle())
            model.refresh()
            model.previewImport("fixture")
            runCurrent()
            repository.failRestore = true
            model.confirmRestore()
            runCurrent()

            assertEquals(StorageFailureKind.UNAVAILABLE, model.uiState.value.queryFailure?.storage?.kind)
            assertEquals(StorageFailureKind.WRITE_FAILED, model.uiState.value.backupFailure?.storage?.kind)
            queryFails = false
            model.retryQuery()
            runCurrent()

            assertNull(model.uiState.value.queryFailure)
            assertEquals(StorageFailureKind.WRITE_FAILED, model.uiState.value.backupFailure?.storage?.kind)
            repository.failRestore = false
            model.retryBackup()
            runCurrent()

            assertEquals(1L, model.uiState.value.replacementGeneration)
            assertNull(model.uiState.value.backupFailure)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test fun `query switching remains live while export awaits the document provider`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val repository = RecordsRepositoryFake()
            var selected: dev.sudoku.app.model.Variant? = null
            val reads = object : dev.sudoku.app.model.GameReadRepository by recordReads(repository) {
                override suspend fun readOverview(
                    variant: dev.sudoku.app.model.Variant,
                    today: String
                ): StorageOutcome<dev.sudoku.app.model.OverviewSnapshot> {
                    selected = variant
                    return recordReads(repository).readOverview(variant, today)
                }
            }
            val model = RecordsViewModel(repository, reads, SavedStateHandle())
            model.refresh()
            runCurrent()
            model.prepareExport()

            model.selectVariant(dev.sudoku.app.model.Variant.DIAGONAL)
            runCurrent()

            assertEquals(dev.sudoku.app.model.Variant.DIAGONAL, selected)
            assertEquals(1L, model.uiState.value.epoch)
            assertEquals(true, model.uiState.value.busy)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test fun `a successful query refresh preserves the failed restore retry`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val repository = RecordsRepositoryFake()
            val model = RecordsViewModel(repository, recordReads(repository), SavedStateHandle())
            model.refresh()
            runCurrent()
            model.previewImport("fixture")
            runCurrent()
            repository.failRestore = true
            model.confirmRestore()
            runCurrent()

            model.refresh()
            runCurrent()
            repository.failRestore = false
            model.retryBackup()
            runCurrent()

            assertEquals(1L, model.uiState.value.replacementGeneration)
            assertNull(model.uiState.value.preview)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test fun `only the selected tab reads data and stale pagination replaces the old list`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val repository = RecordsRepositoryFake()
            var pages = 0
            var version = 0L
            val reads = object : dev.sudoku.app.model.GameReadRepository by recordReads(repository) {
                override suspend fun readPage(
                    query: dev.sudoku.app.model.SummaryQuery,
                    cursor: dev.sudoku.app.model.SummaryCursor?
                ): StorageOutcome<dev.sudoku.app.model.SummaryPage> {
                    pages++
                    if (cursor != null && cursor.generation != version) {
                        return StorageOutcome.Failure(StorageFailure(StorageFailureKind.REVISION_CONFLICT, "Changed"))
                    }
                    return StorageOutcome.Success(
                        dev.sudoku.app.model.SummaryPage(
                            1,
                            listOf(dev.sudoku.app.model.SummaryItem("version-$version", null)),
                            dev.sudoku.app.model.SummaryCursor(
                                1,
                                version,
                                query,
                                100,
                                "last"
                            ),
                            true
                        )
                    )
                }
            }
            val model = RecordsViewModel(repository, reads, SavedStateHandle())
            model.refresh()
            runCurrent()
            assertEquals(0, pages)
            model.selectTab(RecordsTab.SAVES)
            runCurrent()
            assertEquals(1, pages)
            assertEquals(listOf("version-0"), model.uiState.value.items.map { it.id })

            version++
            model.loadMore()
            runCurrent()

            assertEquals(3, pages)
            assertEquals(listOf("version-1"), model.uiState.value.items.map { it.id })
            assertNull(model.uiState.value.error)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test fun `failed replacement keeps preview and offers retry without reporting success`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val repository = RecordsRepositoryFake()
            val model = RecordsViewModel(repository, recordReads(repository), SavedStateHandle())
            model.refresh()
            runCurrent()
            model.previewImport("fixture")
            runCurrent()
            repository.failRestore = true

            model.confirmRestore()
            runCurrent()

            assertNotNull(model.uiState.value.preview)
            assertNotNull(model.uiState.value.error)
            assertEquals(0, model.uiState.value.replacementGeneration)
            repository.failRestore = false
            model.retryBackup()
            runCurrent()
            assertNull(model.uiState.value.preview)
            assertNull(model.uiState.value.error)
            assertEquals(1, model.uiState.value.replacementGeneration)
            assertEquals(2, model.uiState.value.epoch)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test fun `document provider failure never reports exported success`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val model = RecordsRepositoryFake().let { RecordsViewModel(it, recordReads(it), SavedStateHandle()) }
            model.refresh()
            runCurrent()
            assertNotNull(model.prepareExport())
            runCurrent()
            assertEquals(true, model.uiState.value.busy)

            model.finishExport(null, "provider close failed")
            runCurrent()

            assertEquals(false, model.uiState.value.busy)
            assertNull(model.uiState.value.notice)
            assertEquals("provider close failed", model.uiState.value.error)
        } finally {
            Dispatchers.resetMain()
        }
    }
}

private class RecordsRepositoryFake : GameRepository {
    override val datasetEpochs = kotlinx.coroutines.flow.MutableSharedFlow<Long>(replay = 1)
    var epoch = 1L
    var failRestore = false
    var failExport = false
    var failCount = false
    var failClear = false
    var exportCalls = 0
    var countCalls = 0
    val clearEpochs = mutableListOf<Long>()
    private val backup =
        LocalBackup(
            exportedAt = "2026-10-16T01:02:03.004Z",
            sessions = emptyList(),
            results = emptyList(),
            lessons = emptyList(),
            settings = Settings()
        )

    override suspend fun readDatasetEpoch() = StorageOutcome.Success(epoch)

    override suspend fun countQuarantined(): StorageOutcome<Int> {
        countCalls++
        return if (failCount) {
            StorageOutcome.Failure(StorageFailure(StorageFailureKind.UNAVAILABLE, "Count unavailable"))
        } else {
            StorageOutcome.Success(0)
        }
    }

    override suspend fun previewBackup(text: String) = StorageOutcome.Success(BackupPreview(backup, epoch))

    override suspend fun exportBackup(exportedAt: String): StorageOutcome<BackupExport> {
        exportCalls++
        return if (failExport) {
            StorageOutcome.Failure(StorageFailure(StorageFailureKind.WRITE_FAILED, "Export unavailable"))
        } else {
            StorageOutcome.Success(BackupExport(backup, "{}"))
        }
    }

    override suspend fun restoreBackup(preview: BackupPreview): StorageOutcome<Unit> {
        if (failRestore) {
            return StorageOutcome.Failure(
                StorageFailure(StorageFailureKind.WRITE_FAILED, "transaction failed")
            )
        }
        epoch++
        return StorageOutcome.Success(Unit)
    }

    override suspend fun clearAll(expectedEpoch: Long): StorageOutcome<Unit> {
        clearEpochs += expectedEpoch
        if (failClear) {
            return StorageOutcome.Failure(StorageFailure(StorageFailureKind.WRITE_FAILED, "Clear failed"))
        }
        epoch++
        return StorageOutcome.Success(Unit)
    }

    override suspend fun removeQuarantined() = StorageOutcome.Success(Unit)

    override suspend fun readSettings() = StorageOutcome.Success(Settings())

    override suspend fun updateSettings(update: SettingsUpdate, expectedEpoch: Long) =
        StorageOutcome.Success(Settings().updated(update))

    override suspend fun readLessonProgress() = StorageOutcome.Success(emptyList<LessonProgress>())

    override suspend fun writeLessonProgress(progress: LessonProgress, expectedEpoch: Long) =
        StorageOutcome.Success(Unit)

    override suspend fun claimEditor(sessionId: String, ownerId: String): StorageOutcome<EditorToken> = error("Unused")

    override suspend fun releaseEditor(token: EditorToken): StorageOutcome<Unit> = error("Unused")

    override suspend fun writeSession(
        session: GameSession,
        expectedRevision: Long,
        token: EditorToken
    ): StorageOutcome<SessionRecord> = error("Unused")

    override suspend fun replaceActiveSession(
        session: GameSession,
        token: EditorToken,
        previous: PreviousSession?
    ): StorageOutcome<SessionRecord> = error("Unused")
}

private fun recordReads(repository: GameRepository) = object : dev.sudoku.app.model.GameReadRepository by (
    java.lang.reflect.Proxy.newProxyInstance(
        dev.sudoku.app.model.GameReadRepository::class.java.classLoader,
        arrayOf(dev.sudoku.app.model.GameReadRepository::class.java)
    ) { _, method, _ ->
        error("Unexpected records query: ${method.name}")
    } as dev.sudoku.app.model.GameReadRepository
    ) {
    override suspend fun readOverview(
        variant: dev.sudoku.app.model.Variant,
        today: String
    ): StorageOutcome<dev.sudoku.app.model.OverviewSnapshot> {
        val epoch = (repository.readDatasetEpoch() as StorageOutcome.Success).value
        return StorageOutcome.Success(
            dev.sudoku.app.model.OverviewSnapshot(
                epoch,
                dev.sudoku.app.model.summarizeRecords(emptyList(), today, variant),
                false
            )
        )
    }
}
