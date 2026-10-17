package dev.sudoku.app.feature.learning

import dev.sudoku.app.model.learning.Lesson
import dev.sudoku.app.model.learning.LessonCatalogue

internal data class LearningLessonEntry(
    val lesson: dev.sudoku.app.model.learning.LessonDirectoryEntry,
    val number: Int,
    val completed: Boolean,
    val inProgress: Boolean,
    val stageIndex: Int
)

internal data class LearningOverview(
    val totalCount: Int,
    val completedCount: Int,
    val courseCompleted: Int,
    val lessons: List<LearningLessonEntry>,
    val suggested: LearningLessonEntry?
)

/** Derives presentation from authored course order and durable progress without advancing any lesson. */
internal fun LearningUiState.overview(): LearningOverview {
    val allLessons = directory
    val completed = completedIds.intersect(allLessons.map { it.id }.toSet())
    val course = allLessons.filter { it.practiceVariant == selectedVariant }.mapIndexed { index, lesson ->
        val stage = settings.lessonStages?.get(lesson.id)?.takeIf { it in 0 until lesson.stageCount } ?: 0
        val isCompleted = lesson.id in completed
        LearningLessonEntry(
            lesson = lesson,
            number = index + 1,
            completed = isCompleted,
            inProgress = !isCompleted && (lesson.id == settings.currentLessonId || stage > 0),
            stageIndex = stage
        )
    }
    val unfinished = course.filterNot { it.completed }
    val suggested = unfinished.firstOrNull { it.lesson.id == settings.currentLessonId }
        ?: unfinished.firstOrNull()
        ?: course.firstOrNull()

    return LearningOverview(
        LessonCatalogue.bundledLessonCount,
        completed.size,
        course.count {
            it.completed
        },
        course,
        suggested
    )
}
