package dev.sudoku.app.model.learning

import dev.sudoku.app.model.Difficulty
import dev.sudoku.app.model.EngineOutcome
import dev.sudoku.app.model.Variant

data class LessonDirectoryEntry(
    val id: String,
    val title: String,
    val introduction: String,
    val practiceVariant: Variant,
    val practiceDifficulty: Difficulty,
    val stageCount: Int
)

fun Lesson.directoryEntry() =
    LessonDirectoryEntry(id, title, introduction, practiceVariant, practiceDifficulty, stages.size)

/** The directory is generated at build time; only selected lesson assets are decoded at runtime. */
interface LearningContentRepository {
    val directory: List<LessonDirectoryEntry>
    suspend fun loadLesson(id: String): EngineOutcome<LessonCatalogue>
}
