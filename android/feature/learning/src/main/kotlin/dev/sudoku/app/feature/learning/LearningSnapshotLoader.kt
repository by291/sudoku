package dev.sudoku.app.feature.learning

import dev.sudoku.app.model.EngineOutcome
import dev.sudoku.app.model.LearningProgressRepository
import dev.sudoku.app.model.LessonProgress
import dev.sudoku.app.model.Settings
import dev.sudoku.app.model.StorageOutcome
import dev.sudoku.app.model.learning.LearningContentRepository
import dev.sudoku.app.model.learning.LessonCatalogue
import dev.sudoku.app.model.learning.LessonDirectoryEntry
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Epoch-consistent personal facts plus optional independently loaded teaching content. */
internal data class LearningSnapshot(
    val loading: Boolean = true,
    val directory: List<LessonDirectoryEntry> = emptyList(),
    val catalogue: LessonCatalogue? = null,
    val settings: Settings = Settings(),
    val progress: List<LessonProgress> = emptyList(),
    val epoch: Long? = null,
    val error: String? = null
)

/** Combines small personal progress reads with only the requested bundled lesson. */
@Singleton
internal class LearningSnapshotLoader @Inject constructor(
    private val repository: LearningProgressRepository,
    private val content: LearningContentRepository
) {
    private val reads = Mutex()
    internal var snapshot = LearningSnapshot(directory = content.directory)
        private set
    internal val datasetEpochs get() = repository.datasetEpochs

    internal suspend fun readEpoch() = repository.readDatasetEpoch()

    internal fun invalidate() {
        snapshot = LearningSnapshot(directory = content.directory)
    }

    internal suspend fun read(
        lessonId: String? = null,
        onLessonLoaded: (LessonCatalogue) -> Unit = {}
    ): LearningSnapshot = coroutineScope {
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
                        LearningSnapshot(loading = false, error = "学习进度暂时无法读取，请重试。")
                    epoch.value != currentEpoch.value ->
                        LearningSnapshot(loading = false, error = "本地资料已更新，请重新读取课程。")
                    lessonId != null && catalogue !is EngineOutcome.Completed ->
                        LearningSnapshot(loading = false, error = contentFailure(checkNotNull(catalogue)))
                    else -> LearningSnapshot(
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
    is EngineOutcome.Incomplete -> "课程校验尚未完成，请重试。"
    EngineOutcome.Cancelled -> "课程加载已取消，可以重试。"
    EngineOutcome.TimedOut -> "课程校验超时，请重试。"
    is EngineOutcome.InvalidInput -> "课程数据校验未通过。"
    is EngineOutcome.Failed -> "课程暂时无法校验，请重试。"
    is EngineOutcome.Completed -> error("Completed catalogue is not a loading failure")
}
