package dev.yigeyinian.sudoku.model.learning

import dev.yigeyinian.sudoku.model.EngineOutcome

/** Loads bundled content whose mathematical evidence was validated during the build. Failed reads are retryable. */
interface LearningContentRepository {
    suspend fun load(): EngineOutcome<LessonCatalogue>
}
