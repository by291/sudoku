package dev.yigeyinian.sudoku.model.learning

import dev.yigeyinian.sudoku.model.EngineOutcome

/** Publishes authored content only after complete mathematical validation. Incomplete loads are retryable. */
interface LearningContentRepository {
    suspend fun load(): EngineOutcome<LessonCatalogue>
}
