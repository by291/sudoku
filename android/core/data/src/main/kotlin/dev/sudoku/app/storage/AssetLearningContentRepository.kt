package dev.sudoku.app.storage

import android.content.Context
import dev.sudoku.app.model.EngineOutcome
import dev.sudoku.app.model.learning.LearningContentRepository
import dev.sudoku.app.model.learning.LessonCatalogue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/** Reads build-validated bundled content; runtime decoding still rejects malformed asset structure. */
class AssetLearningContentRepository(private val context: Context) : LearningContentRepository {
    private val loading = Mutex()
    private val cached = linkedMapOf<String, LessonCatalogue>()
    override val directory = BundledLessonDirectory.entries

    override suspend fun loadLesson(id: String): EngineOutcome<LessonCatalogue> =
        loading.withLock<EngineOutcome<LessonCatalogue>> {
            if (directory.none { it.id == id }) {
                return@withLock EngineOutcome.Failed("Unknown course identity")
            }

            cached.remove(id)?.let {
                cached[id] = it
                return@withLock EngineOutcome.Completed(it)
            }
            try {
                val catalogue = withContext(Dispatchers.IO) {
                    context.assets.open("lessons/$id.json").bufferedReader(Charsets.UTF_8).use {
                        LessonCatalogue.decodeLesson(it.readText())
                    }
                }
                require(catalogue.lesson(id) != null) { "Lesson asset identity mismatch" }
                cached[id] = catalogue
                while (cached.size > MAX_CACHED_LESSONS) {
                    cached.remove(cached.keys.first())
                }
                EngineOutcome.Completed(catalogue)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                EngineOutcome.Failed(error.message ?: "Unable to load teaching content")
            }
        }
}

private const val MAX_CACHED_LESSONS = 3
