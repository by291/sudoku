package dev.sudoku.app.feature.learning

import dev.sudoku.app.model.EngineOutcome
import dev.sudoku.app.model.GameRepository
import dev.sudoku.app.model.StorageOutcome
import dev.sudoku.app.model.learning.LearningContentRepository
import dev.sudoku.app.model.learning.LessonCatalogue
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Combines small personal progress reads with only the requested bundled lesson. */
@Singleton
class LearningSnapshotLoader @Inject constructor(
    private val repository: GameRepository,
    private val content: LearningContentRepository
) {
    internal var snapshot = LearningUiState(directory = content.directory)
        private set
    internal val datasetEpochs get() = repository.datasetEpochs
    internal fun invalidate() {
        snapshot = LearningUiState(directory = content.directory)
    }
    private val reads = Mutex()
    internal suspend fun read(
        lessonId: String? = null,
        onLessonLoaded: (LessonCatalogue) -> Unit = {}
    ): LearningUiState = coroutineScope {
        // Bundled teaching content is independent of the personal dataset and its read lock.
        // Publish it early, but only the complete snapshot below may authorize an exercise.
        val catalogueRead = async {
            lessonId?.let { content.loadLesson(it) }.also { result ->
                if (result is EngineOutcome.Completed) onLessonLoaded(result.value)
            }
        }
        reads.withLock {
            val result = coroutineScope {
                val epoch = repository.readDatasetEpoch()
                val settingsRead = async { repository.readSettings() }
                val progressRead = async { repository.readLessonProgress() }
                val catalogue = catalogueRead.await()
                val settings = settingsRead.await()
                val progress = progressRead.await()
                val currentEpoch = repository.readDatasetEpoch()
                when {
                    epoch !is StorageOutcome.Success || currentEpoch !is StorageOutcome.Success ||
                        settings !is StorageOutcome.Success || progress !is StorageOutcome.Success ->
                        LearningUiState(loading = false, error = "学习进度暂时无法读取，请重试。")
                    epoch.value != currentEpoch.value ->
                        LearningUiState(loading = false, error = "本地资料已更新，请重新读取课程。")
                    lessonId != null && catalogue !is EngineOutcome.Completed ->
                        LearningUiState(loading = false, error = contentFailure(checkNotNull(catalogue)))
                    else -> LearningUiState(
                        loading = false,
                        catalogue = (catalogue as? EngineOutcome.Completed)?.value,
                        directory = content.directory,
                        settings = settings.value,
                        progress = progress.value,
                        epoch = epoch.value
                    )
                }
            }
            // Publish only a complete epoch-consistent snapshot, never partial or cancelled reads.
            snapshot = result.copy(catalogue = null, directory = content.directory)
            result.copy(directory = content.directory)
        }
    }
}

private fun contentFailure(result: EngineOutcome<*>): String = when (result) {
    is EngineOutcome.BudgetExhausted -> "课程校验尚未完成，请重试。"
    EngineOutcome.Cancelled -> "课程加载已取消，可以重试。"
    EngineOutcome.TimedOut -> "课程校验超时，请重试。"
    is EngineOutcome.Failed -> "课程暂时无法校验，请重试。"
    is EngineOutcome.Completed -> error("Completed catalogue is not a loading failure")
}
