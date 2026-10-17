package dev.yigeyinian.sudoku.storage

import android.content.Context
import dev.yigeyinian.sudoku.model.EngineOutcome
import dev.yigeyinian.sudoku.model.learning.LearningContentRepository
import dev.yigeyinian.sudoku.model.learning.LessonCatalogue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/** Reads build-validated bundled content; runtime decoding still rejects malformed asset structure. */
class AssetLearningContentRepository(private val context: Context) : LearningContentRepository {
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
            cached = catalogue
            EngineOutcome.Completed(catalogue)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            EngineOutcome.Failed(error.message ?: "Unable to load teaching content")
        }
    }
}
