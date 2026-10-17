package dev.yigeyinian.sudoku.model.learning

import dev.yigeyinian.sudoku.model.Difficulty
import dev.yigeyinian.sudoku.model.EngineOutcome
import dev.yigeyinian.sudoku.model.Variant

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
