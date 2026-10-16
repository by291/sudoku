package dev.yigeyinian.sudoku.feature.learning

import dev.yigeyinian.sudoku.model.BackupExport
import dev.yigeyinian.sudoku.model.BackupPreview
import dev.yigeyinian.sudoku.model.EditorToken
import dev.yigeyinian.sudoku.model.EngineOutcome
import dev.yigeyinian.sudoku.model.GameRepository
import dev.yigeyinian.sudoku.model.GameSession
import dev.yigeyinian.sudoku.model.LessonProgress
import dev.yigeyinian.sudoku.model.PreviousSession
import dev.yigeyinian.sudoku.model.ResultRecord
import dev.yigeyinian.sudoku.model.SessionRecord
import dev.yigeyinian.sudoku.model.Settings
import dev.yigeyinian.sudoku.model.StorageFailure
import dev.yigeyinian.sudoku.model.StorageFailureKind
import dev.yigeyinian.sudoku.model.StorageOutcome
import dev.yigeyinian.sudoku.model.learning.ExerciseAnswer
import dev.yigeyinian.sudoku.model.learning.LearningContentRepository
import dev.yigeyinian.sudoku.model.learning.LessonCatalogue
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
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
class LearningViewModelTest {
    private fun catalogue(): LessonCatalogue = LessonCatalogue.decode(
        checkNotNull(javaClass.classLoader.getResourceAsStream("lessons/catalogue.json")).bufferedReader().use {
            it.readText()
        }
    )

    private fun model(repository: LearningRepository): LearningViewModel {
        val courses = catalogue()
        return LearningViewModel(
            repository,
            object : LearningContentRepository {
                override suspend fun load() = EngineOutcome.Completed(courses)
            }
        )
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
    var epoch = 0L
    var settings = Settings()
    val progress = mutableListOf<LessonProgress>()
    var failSettings = false
    var pendingSettings: CompletableDeferred<Unit>? = null

    override suspend fun readDatasetEpoch() = StorageOutcome.Success(epoch)
    override suspend fun readSettings() = StorageOutcome.Success(settings)
    override suspend fun readLessonProgress() = StorageOutcome.Success(progress.toList())
    override suspend fun writeSettings(settings: Settings, expectedEpoch: Long): StorageOutcome<Unit> {
        pendingSettings?.await()
        if (failSettings || expectedEpoch != epoch) {
            return StorageOutcome.Failure(StorageFailure(StorageFailureKind.WRITE_FAILED, "Test save failure"))
        }
        this.settings = settings
        return StorageOutcome.Success(Unit)
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
    override suspend fun listSessions(): StorageOutcome<List<SessionRecord>> = error("Unused player operation")
    override suspend fun listResults(): StorageOutcome<List<ResultRecord>> = error("Unused player operation")
    override suspend fun exportBackup(exportedAt: String): StorageOutcome<BackupExport> =
        error("Unused player operation")
    override suspend fun previewBackup(text: String): StorageOutcome<BackupPreview> = error("Unused player operation")
    override suspend fun restoreBackup(preview: BackupPreview): StorageOutcome<Unit> = error("Unused player operation")
    override suspend fun clearAll(expectedEpoch: Long): StorageOutcome<Unit> = error("Unused player operation")
    override suspend fun countQuarantined(): StorageOutcome<Int> = error("Unused player operation")
    override suspend fun removeQuarantined(): StorageOutcome<Unit> = error("Unused player operation")
}
