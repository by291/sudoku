package dev.sudoku.app.feature.learning

import dev.sudoku.app.model.BackupExport
import dev.sudoku.app.model.BackupPreview
import dev.sudoku.app.model.EditorToken
import dev.sudoku.app.model.EngineOutcome
import dev.sudoku.app.model.GameRepository
import dev.sudoku.app.model.GameSession
import dev.sudoku.app.model.LessonProgress
import dev.sudoku.app.model.PreviousSession
import dev.sudoku.app.model.SessionRecord
import dev.sudoku.app.model.Settings
import dev.sudoku.app.model.SettingsUpdate
import dev.sudoku.app.model.StorageFailure
import dev.sudoku.app.model.StorageFailureKind
import dev.sudoku.app.model.StorageOutcome
import dev.sudoku.app.model.learning.ExerciseAnswer
import dev.sudoku.app.model.learning.LearningContentRepository
import dev.sudoku.app.model.learning.LessonCatalogue
import dev.sudoku.app.model.learning.directoryEntry
import dev.sudoku.app.model.updated
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class LearningViewModelTest {
    @Test fun `replacement observed during unknown progress fences a suspended old final read`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val backing = LearningRepository()
            backing.settings = Settings(currentLessonId = "hidden-single", lessonStages = mapOf("hidden-single" to 1))
            backing.progress += LessonProgress("rules", "2026-10-17T00:00:00.000Z")
            backing.datasetEpochs.emit(0)
            val finalReadCaptured = CompletableDeferred<Unit>()
            val releaseFinalRead = CompletableDeferred<Unit>()
            var epochReads = 0
            val repository = object : GameRepository by backing {
                override suspend fun readDatasetEpoch(): StorageOutcome<Long> {
                    val captured = backing.epoch
                    epochReads++
                    if (epochReads == 3) {
                        finalReadCaptured.complete(Unit)
                        withContext(NonCancellable) { releaseFinalRead.await() }
                    }
                    return StorageOutcome.Success(captured)
                }
            }
            val courses = catalogue()
            val model = LearningDirectoryViewModel(
                LearningSnapshotLoader(
                    repository,
                    object : LearningContentRepository {
                        override val directory = courses.lessons.map { it.directoryEntry() }

                        override suspend fun loadLesson(id: String) = EngineOutcome.Completed(courses)
                    }
                )
            )
            val deliveries = mutableListOf<LearningDirectoryState>()
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
                model.uiState.collect { deliveries += it }
            }
            backgroundScope.launch { model.observe() }
            runCurrent()
            assertTrue(finalReadCaptured.isCompleted)
            assertEquals(null, model.uiState.value.epoch)

            backing.epoch = 1
            backing.settings = Settings()
            backing.progress.clear()
            backing.failProgress = true
            backing.datasetEpochs.emit(1)
            runCurrent()
            releaseFinalRead.complete(Unit)
            runCurrent()

            assertTrue(deliveries.none { it.epoch == 0L || it.progress.isNotEmpty() })
            assertTrue(deliveries.none { it.settings.currentLessonId == "hidden-single" })
            assertTrue(deliveries.all { it.overview().suggested == null })
            assertEquals(null, model.uiState.value.epoch)
            assertNotNull(model.uiState.value.error)

            backing.failProgress = false
            model.open()
            runCurrent()

            assertEquals(1L, model.uiState.value.epoch)
            assertEquals(0, model.uiState.value.overview().completedCount)
            assertEquals("rules", model.uiState.value.overview().suggested?.lesson?.id)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun `lesson content is visible while durable progress is still pending`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val backing = LearningRepository()
            val progressGate = CompletableDeferred<Unit>()
            val repository = object : GameRepository by backing {
                override suspend fun readLessonProgress(): StorageOutcome<List<LessonProgress>> {
                    progressGate.await()
                    return backing.readLessonProgress()
                }
            }
            val courses = catalogue()
            val model =
                LearningViewModel(
                    repository,
                    LearningSnapshotLoader(
                        repository,
                        object : LearningContentRepository {
                            override val directory = courses.lessons.map { it.directoryEntry() }

                            override suspend fun loadLesson(id: String) = EngineOutcome.Completed(courses)
                        }
                    )
                )

            model.open("rules")
            runCurrent()

            assertNotNull(model.uiState.value.lesson)
            assertTrue(model.uiState.value.loading)
            assertEquals(null, model.uiState.value.epoch)
            model.startExercise()
            assertFalse(model.uiState.value.exerciseStarted)

            progressGate.complete(Unit)
            advanceUntilIdle()

            assertFalse(model.uiState.value.loading)
            assertEquals(0L, model.uiState.value.epoch)
            model.startExercise()
            assertTrue(model.uiState.value.exerciseStarted)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun `personal read failure keeps the guide visible without permitting exercises`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val repository = LearningRepository()
            repository.failProgress = true
            val model = model(repository)

            model.open("rules")
            advanceUntilIdle()

            assertNotNull(model.uiState.value.lesson)
            assertNotNull(model.uiState.value.error)
            assertEquals(null, model.uiState.value.epoch)
            model.startExercise()
            assertFalse(model.uiState.value.exerciseStarted)
            val lesson = model.uiState.value.lesson

            repository.failProgress = false
            model.open("rules")
            assertEquals(lesson, model.uiState.value.lesson)
            advanceUntilIdle()
            assertTrue(model.uiState.value.exerciseReady)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test fun `dataset replacement clears personal progress even if subsequent progress reads fail`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val repository = LearningRepository()
            repository.progress.add(LessonProgress("rules", "2026-10-17T00:00:00.000Z"))
            val courses = catalogue()
            val model =
                LearningDirectoryViewModel(
                    LearningSnapshotLoader(
                        repository,
                        object : LearningContentRepository {
                            override val directory = courses.lessons.map { it.directoryEntry() }

                            override suspend fun loadLesson(id: String) = EngineOutcome.Completed(courses)
                        }
                    )
                )
            backgroundScope.launch { model.observe() }
            runCurrent()
            assertEquals(1, model.uiState.value.overview().completedCount)

            repository.epoch = 1
            repository.failProgress = true
            repository.datasetEpochs.emit(1)
            runCurrent()

            assertTrue(model.uiState.value.progress.isEmpty())
            assertEquals(null, model.uiState.value.epoch)
            assertEquals(32, model.uiState.value.directory.size)
            assertNotNull(model.uiState.value.error)
        } finally {
            Dispatchers.resetMain()
        }
    }

    private fun catalogue(): LessonCatalogue = LessonCatalogue.decode(
        checkNotNull(javaClass.classLoader.getResourceAsStream("lessons/catalogue.json")).bufferedReader().use {
            it.readText()
        }
    )

    private fun model(repository: LearningRepository): LearningViewModel {
        val courses = catalogue()
        return LearningViewModel(
            repository,
            LearningSnapshotLoader(
                repository,
                object : LearningContentRepository {
                    override val directory = courses.lessons.map { it.directoryEntry() }

                    override suspend fun loadLesson(id: String) = EngineOutcome.Completed(courses)
                }
            )
        )
    }

    @Test
    fun `static directory is immediate and opening it never decodes lesson boards`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val repository = LearningRepository()
            val courses = catalogue()
            var reads = 0
            val loader = LearningSnapshotLoader(
                repository,
                object : LearningContentRepository {
                    override val directory = courses.lessons.map { it.directoryEntry() }

                    override suspend fun loadLesson(id: String): EngineOutcome<LessonCatalogue> {
                        reads++
                        return EngineOutcome.Completed(courses)
                    }
                }
            )
            val model = LearningDirectoryViewModel(loader)

            assertTrue(model.uiState.value.loading)
            assertEquals(12, model.uiState.value.overview().lessons.size)
            model.open()
            runCurrent()

            assertFalse(model.uiState.value.loading)
            assertEquals(0, reads)
            repository.progress.add(LessonProgress("rules", "2026-10-17T00:00:00.000Z"))
            model.open()
            assertEquals(12, model.uiState.value.overview().lessons.size)
            advanceUntilIdle()
            assertEquals(1, model.uiState.value.overview().completedCount)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun `preparation rejects mixed datasets and can retry after replacement`() = runTest {
        val repository = LearningRepository()
        val progressGate = CompletableDeferred<Unit>()
        val courses = catalogue()
        val loader = LearningSnapshotLoader(
            object : GameRepository by repository {
                override suspend fun readLessonProgress(): StorageOutcome<List<LessonProgress>> {
                    progressGate.await()
                    return repository.readLessonProgress()
                }
            },
            object : LearningContentRepository {
                override val directory = courses.lessons.map { it.directoryEntry() }

                override suspend fun loadLesson(id: String) = EngineOutcome.Completed(courses)
            }
        )
        val preparation = launch { loader.read() }
        runCurrent()
        assertTrue(loader.snapshot.loading)
        assertEquals(null, loader.snapshot.catalogue)

        repository.epoch++
        progressGate.complete(Unit)
        preparation.join()

        assertNotNull(loader.snapshot.error)
        assertEquals(null, loader.snapshot.catalogue)
        loader.read()
        assertEquals(1L, loader.snapshot.epoch)
        assertEquals(32, loader.snapshot.directory.size)
    }

    private fun answerCurrent(model: LearningViewModel) {
        when (val answer = checkNotNull(model.uiState.value.stage).answer) {
            is ExerciseAnswer.Place -> {
                model.selectCell(answer.expected.cell)
                model.enterDigit(answer.expected.digit)
            }
            is ExerciseAnswer.Eliminate -> answer.expected.forEach {
                model.selectCell(it.cell)
                model.enterDigit(it.digit)
            }
        }
        model.submit()
    }

    @Test
    fun `correct answer persists next cursor but waits for explicit next stage`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val repository = LearningRepository()
            val model = model(repository)
            model.open("killer-combined")
            advanceUntilIdle()
            model.startExercise()

            answerCurrent(model)
            advanceUntilIdle()

            assertEquals(1, repository.settings.lessonStages?.get("killer-combined"))
            assertEquals(0, model.uiState.value.cursor?.stageIndex)
            assertTrue(checkNotNull(model.uiState.value.feedback).correct)
            assertTrue(repository.progress.isEmpty())

            model.nextStage()
            assertEquals(1, model.uiState.value.cursor?.stageIndex)
            assertEquals(null, model.uiState.value.feedback)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun `failed save retains answer and current stage for an explicit retry`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val repository = LearningRepository().apply { failSettings = true }
            val model = model(repository)
            model.open("rules")
            advanceUntilIdle()
            model.startExercise()

            answerCurrent(model)
            advanceUntilIdle()

            assertEquals(0, model.uiState.value.cursor?.stageIndex)
            assertNotNull(model.uiState.value.error)
            assertEquals(null, model.uiState.value.feedback)
            assertNotNull(model.uiState.value.placement)

            repository.failSettings = false
            model.submit()
            advanceUntilIdle()

            assertEquals(1, repository.settings.lessonStages?.get("rules"))
            assertTrue(checkNotNull(model.uiState.value.feedback).correct)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun `restores a saved stage and records completion only after all remaining answers`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val repository = LearningRepository().apply {
                settings =
                    Settings(lessonStages = mapOf("killer-combined" to 4))
            }
            val model = model(repository)
            model.open("killer-combined")
            advanceUntilIdle()
            model.startExercise()

            assertEquals(4, model.uiState.value.cursor?.stageIndex)
            answerCurrent(model)
            advanceUntilIdle()
            assertTrue(repository.progress.isEmpty())
            model.nextStage()
            answerCurrent(model)
            advanceUntilIdle()

            assertEquals(listOf("killer-combined"), repository.progress.map { it.lessonId })
            assertFalse(repository.settings.lessonStages.orEmpty().containsKey("killer-combined"))
            assertTrue(checkNotNull(model.uiState.value.feedback).completed)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun `dataset replacement rejects a pending answer and restores the new dataset cursor`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val repository = LearningRepository()
            val model = model(repository)
            model.open("rules")
            advanceUntilIdle()
            model.startExercise()
            repository.pendingSettings = CompletableDeferred()
            answerCurrent(model)
            runCurrent()

            repository.epoch++
            repository.settings = Settings()
            repository.pendingSettings?.complete(Unit)
            advanceUntilIdle()

            assertEquals(null, model.uiState.value.feedback)
            assertEquals(0, model.uiState.value.cursor?.stageIndex)
            assertFalse(model.uiState.value.exerciseStarted)
            assertTrue(repository.settings.lessonStages.isNullOrEmpty())
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun `wrong answer preserves the current stage and every stored fact`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val repository = LearningRepository()
            val model = model(repository)
            model.open("rules")
            advanceUntilIdle()
            model.startExercise()
            model.selectCell(40)
            model.enterDigit(6)

            model.submit()
            advanceUntilIdle()

            assertFalse(checkNotNull(model.uiState.value.feedback).correct)
            assertEquals(0, model.uiState.value.cursor?.stageIndex)
            assertTrue(repository.progress.isEmpty())
            assertTrue(repository.settings.lessonStages.isNullOrEmpty())
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun `retry after completion cursor failure retains the original committed timestamp`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val repository = LearningRepository().apply { settings = Settings(lessonStages = mapOf("rules" to 1)) }
            val model = model(repository)
            model.open("rules")
            advanceUntilIdle()
            model.startExercise()
            repository.failSettings = true

            answerCurrent(model)
            advanceUntilIdle()
            val first = repository.progress.single()
            assertNotNull(model.uiState.value.error)
            assertEquals(null, model.uiState.value.feedback)

            repository.failSettings = false
            model.submit()
            advanceUntilIdle()

            assertEquals(first, repository.progress.single())
            assertEquals(first, model.uiState.value.progress.single())
            assertTrue(first.completedAt.matches(Regex(".*\\.[0-9]{3}Z")))
            assertTrue(checkNotNull(model.uiState.value.feedback).completed)
        } finally {
            Dispatchers.resetMain()
        }
    }
}

private class LearningRepository : GameRepository {
    override val datasetEpochs = kotlinx.coroutines.flow.MutableSharedFlow<Long>(replay = 1)
    var epoch = 0L
    var settings = Settings()
    val progress = mutableListOf<LessonProgress>()
    var failProgress = false
    var failSettings = false
    var pendingSettings: CompletableDeferred<Unit>? = null

    override suspend fun readDatasetEpoch() = StorageOutcome.Success(epoch)

    override suspend fun readSettings() = StorageOutcome.Success(settings)

    override suspend fun readLessonProgress(): StorageOutcome<List<LessonProgress>> = if (failProgress) {
        StorageOutcome.Failure(StorageFailure(StorageFailureKind.UNAVAILABLE, "Progress unavailable"))
    } else {
        StorageOutcome.Success(progress.toList())
    }

    override suspend fun updateSettings(update: SettingsUpdate, expectedEpoch: Long): StorageOutcome<Settings> {
        pendingSettings?.await()
        if (failSettings || expectedEpoch != epoch) {
            return StorageOutcome.Failure(StorageFailure(StorageFailureKind.WRITE_FAILED, "Test save failure"))
        }
        settings = settings.updated(update)
        return StorageOutcome.Success(settings)
    }

    override suspend fun writeLessonProgress(progress: LessonProgress, expectedEpoch: Long): StorageOutcome<Unit> {
        check(expectedEpoch == epoch)
        if (this.progress.none { it.lessonId == progress.lessonId }) {
            this.progress += progress
        }
        return StorageOutcome.Success(Unit)
    }

    override suspend fun claimEditor(sessionId: String, ownerId: String): StorageOutcome<EditorToken> =
        error("Unused player operation")

    override suspend fun releaseEditor(token: EditorToken): StorageOutcome<Unit> = error("Unused player operation")

    override suspend fun writeSession(
        session: GameSession,
        expectedRevision: Long,
        token: EditorToken
    ): StorageOutcome<SessionRecord> = error("Unused player operation")

    override suspend fun replaceActiveSession(
        session: GameSession,
        token: EditorToken,
        previous: PreviousSession?
    ): StorageOutcome<SessionRecord> = error("Unused player operation")

    override suspend fun exportBackup(exportedAt: String): StorageOutcome<BackupExport> =
        error("Unused player operation")

    override suspend fun previewBackup(text: String): StorageOutcome<BackupPreview> = error("Unused player operation")

    override suspend fun restoreBackup(preview: BackupPreview): StorageOutcome<Unit> = error("Unused player operation")

    override suspend fun clearAll(expectedEpoch: Long): StorageOutcome<Unit> = error("Unused player operation")

    override suspend fun countQuarantined(): StorageOutcome<Int> = error("Unused player operation")

    override suspend fun removeQuarantined(): StorageOutcome<Unit> = error("Unused player operation")
}
