package dev.yigeyinian.sudoku.feature.learning

import dev.yigeyinian.sudoku.model.EngineOutcome
import dev.yigeyinian.sudoku.model.GameRepository
import dev.yigeyinian.sudoku.model.StorageOutcome
import dev.yigeyinian.sudoku.model.learning.LearningContentRepository
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Prepares the directory before navigation; lesson workflows still refresh durable progress. */
@Singleton
class LearningSnapshotLoader @Inject constructor(
    private val repository: GameRepository,
    private val content: LearningContentRepository
) {
    internal var snapshot = LearningUiState()
        private set
    private val reads = Mutex()
    private var preparedForDirectory = false

    /** Errors stay in the learning snapshot for its retry UI, without blocking unrelated play. */
    suspend fun prepare() {
        read()
        preparedForDirectory = true
    }

    internal fun takePreparedDirectory(): LearningUiState? {
        if (!preparedForDirectory) {
            return null
        }
        preparedForDirectory = false
        return snapshot
    }

    internal suspend fun read(): LearningUiState = reads.withLock {
        preparedForDirectory = false
        val result = coroutineScope {
            val epoch = repository.readDatasetEpoch()
            val catalogueRead = async { content.load() }
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
                catalogue !is EngineOutcome.Completed ->
                    LearningUiState(loading = false, error = contentFailure(catalogue))
                else -> LearningUiState(
                    loading = false,
                    catalogue = catalogue.value,
                    settings = settings.value,
                    progress = progress.value,
                    epoch = epoch.value
                )
            }
        }
        // Publish only a complete epoch-consistent snapshot, never partial or cancelled reads.
        snapshot = result
        result
    }
}

private fun contentFailure(result: EngineOutcome<*>): String = when (result) {
    is EngineOutcome.BudgetExhausted -> "课程校验尚未完成，请重试。"
    EngineOutcome.Cancelled -> "课程加载已取消，可以重试。"
    EngineOutcome.TimedOut -> "课程校验超时，请重试。"
    is EngineOutcome.Failed -> "课程暂时无法校验，请重试。"
    is EngineOutcome.Completed -> error("Completed catalogue is not a loading failure")
}
