package dev.sudoku.app.feature.records

import dev.sudoku.app.model.BackupExport
import dev.sudoku.app.model.BackupPreview
import dev.sudoku.app.model.EditorToken
import dev.sudoku.app.model.GameRepository
import dev.sudoku.app.model.GameSession
import dev.sudoku.app.model.LessonProgress
import dev.sudoku.app.model.LocalBackup
import dev.sudoku.app.model.PreviousSession
import dev.sudoku.app.model.ResultRecord
import dev.sudoku.app.model.SessionRecord
import dev.sudoku.app.model.Settings
import dev.sudoku.app.model.StorageFailure
import dev.sudoku.app.model.StorageFailureKind
import dev.sudoku.app.model.StorageOutcome
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
    @Test fun `only the selected tab reads data and stale pagination replaces the old list`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val repository = RecordsRepositoryFake()
            var pages = 0
            var version = 0L
            val reads = object : dev.sudoku.app.model.GameReadRepository by recordReads(repository) {
                override suspend fun readPage(
                    variant: dev.sudoku.app.model.Variant?,
                    results: Boolean,
                    unfinished: Boolean,
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
                                variant,
                                results,
                                unfinished,
                                100,
                                "last"
                            ),
                            true
                        )
                    )
                }
            }
            val model = RecordsViewModel(repository, reads)
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
            val model = RecordsViewModel(repository, recordReads(repository))
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
            model.retry()
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
            val model = RecordsRepositoryFake().let { RecordsViewModel(it, recordReads(it)) }
            model.refresh()
            runCurrent()
            assertNotNull(model.prepareExport())
            assertEquals(true, model.uiState.value.busy)

            model.finishExport(null, "provider close failed")

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
    private val backup =
        LocalBackup(
            exportedAt = "2026-10-16T01:02:03.004Z",
            sessions = emptyList(),
            results = emptyList(),
            lessons = emptyList(),
            settings = Settings()
        )
    override suspend fun listSessions() = StorageOutcome.Success(emptyList<SessionRecord>())
    override suspend fun listResults() = StorageOutcome.Success(emptyList<ResultRecord>())
    override suspend fun readDatasetEpoch() = StorageOutcome.Success(epoch)
    override suspend fun countQuarantined() = StorageOutcome.Success(0)
    override suspend fun previewBackup(text: String) = StorageOutcome.Success(BackupPreview(backup, epoch))
    override suspend fun exportBackup(exportedAt: String) = StorageOutcome.Success(BackupExport(backup, "{}"))
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
        epoch++
        return StorageOutcome.Success(Unit)
    }
    override suspend fun removeQuarantined() = StorageOutcome.Success(Unit)
    override suspend fun readSettings() = StorageOutcome.Success(Settings())
    override suspend fun writeSettings(settings: Settings, expectedEpoch: Long) = StorageOutcome.Success(Unit)
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
