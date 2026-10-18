package dev.sudoku.app.feature.learning

import dev.sudoku.app.model.LearningProgressRepository
import dev.sudoku.app.model.LessonProgress
import dev.sudoku.app.model.Settings
import dev.sudoku.app.model.SettingsUpdate
import dev.sudoku.app.model.StorageFailure
import dev.sudoku.app.model.StorageOutcome
import dev.sudoku.app.model.isoInstant
import dev.sudoku.app.model.learning.ExerciseSubmission
import java.time.Instant
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

internal sealed interface LearningWriteResult {
    data class Saved(val settings: Settings, val progress: List<LessonProgress>) : LearningWriteResult

    data object DatasetChanged : LearningWriteResult

    data class Failed(val failure: StorageFailure) : LearningWriteResult
}

/** Serializes completion-before-cursor writes; neither a partial write nor cancellation permits Next. */
internal class LearningProgressWriter(private val repository: LearningProgressRepository) {
    private val writes = Mutex()

    suspend fun save(
        accepted: ExerciseSubmission.Accepted,
        epoch: Long,
        progress: List<LessonProgress>
    ): LearningWriteResult = writes.withLock {
        // Capture the submitted completion intent before repository calls can suspend.
        val firstCompletion = accepted is ExerciseSubmission.Completed && progress.none {
            it.lessonId == accepted.cursor.lessonId
        }
        when (val before = repository.readDatasetEpoch()) {
            is StorageOutcome.Failure -> return@withLock LearningWriteResult.Failed(before.error)
            is StorageOutcome.Success -> if (before.value != epoch) {
                return@withLock LearningWriteResult.DatasetChanged
            }
        }
        currentCoroutineContext().ensureActive()

        val lessonId = accepted.cursor.lessonId
        if (firstCompletion) {
            // The repository retains the first completion even if the following cursor write needs retry.
            val completion = LessonProgress(lessonId, isoInstant(Instant.now()))
            val result = repository.writeLessonProgress(completion, epoch)
            currentCoroutineContext().ensureActive()
            if (result is StorageOutcome.Failure) {
                return@withLock failure(result.error, epoch)
            }
        }
        val intent = SettingsUpdate.LessonCursor(
            lessonId,
            accepted.cursor.stageIndex.takeUnless { accepted is ExerciseSubmission.Completed }
        )
        val settings = repository.updateSettings(intent, epoch)
        currentCoroutineContext().ensureActive()
        if (settings is StorageOutcome.Failure) {
            return@withLock failure(settings.error, epoch)
        }

        val retained = repository.readLessonProgress()
        val after = repository.readDatasetEpoch()
        currentCoroutineContext().ensureActive()
        when {
            after is StorageOutcome.Success && after.value != epoch -> LearningWriteResult.DatasetChanged
            after is StorageOutcome.Failure -> LearningWriteResult.Failed(after.error)
            retained is StorageOutcome.Failure -> LearningWriteResult.Failed(retained.error)
            settings is StorageOutcome.Success && retained is StorageOutcome.Success ->
                LearningWriteResult.Saved(settings.value, retained.value)
            else -> error("Unreachable successful learning write")
        }
    }

    private suspend fun failure(failure: StorageFailure, epoch: Long): LearningWriteResult {
        val current = repository.readDatasetEpoch()
        currentCoroutineContext().ensureActive()
        return if (current is StorageOutcome.Success && current.value != epoch) {
            LearningWriteResult.DatasetChanged
        } else {
            LearningWriteResult.Failed(failure)
        }
    }
}
