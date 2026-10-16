package dev.yigeyinian.sudoku.storage

import android.content.Context
import dev.yigeyinian.sudoku.model.EngineOutcome
import dev.yigeyinian.sudoku.model.SudokuEngine
import dev.yigeyinian.sudoku.model.Validation
import dev.yigeyinian.sudoku.model.learning.LearningContentRepository
import dev.yigeyinian.sudoku.model.learning.LessonCatalogue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/** Owns asset I/O and caches only fully validated immutable teaching content. */
class AssetLearningContentRepository(private val context: Context, private val engine: SudokuEngine) :
    LearningContentRepository {
    private val loading = Mutex()
    private var cached: LessonCatalogue? = null

    override suspend fun load(): EngineOutcome<LessonCatalogue> = loading.withLock<EngineOutcome<LessonCatalogue>> {
        cached?.let { return@withLock EngineOutcome.Completed(it) }
        try {
            val catalogue = withContext(Dispatchers.IO) {
                context.assets.open("lessons/catalogue.json").bufferedReader(Charsets.UTF_8).use {
                    LessonCatalogue.decode(it.readText())
                }
            }
            when (val result = catalogue.validate(engine)) {
                is EngineOutcome.Completed -> when (val validation = result.value) {
                    Validation.Valid -> {
                        cached = catalogue
                        EngineOutcome.Completed(catalogue, result.workUsed)
                    }
                    is Validation.Invalid -> EngineOutcome.Failed(validation.issues.joinToString("; "))
                }
                is EngineOutcome.BudgetExhausted -> result
                EngineOutcome.Cancelled -> EngineOutcome.Cancelled
                EngineOutcome.TimedOut -> EngineOutcome.TimedOut
                is EngineOutcome.Failed -> result
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            EngineOutcome.Failed(error.message ?: "Unable to load teaching content")
        }
    }
}
