package dev.yigeyinian.sudoku.feature.learning

import dev.yigeyinian.sudoku.model.learning.Lesson

internal data class LearningLessonEntry(
    val lesson: Lesson,
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
    val allLessons = catalogue?.lessons.orEmpty()
    val completed = completedIds.intersect(allLessons.map { it.id }.toSet())
    val course = allLessons.filter { it.practiceVariant == selectedVariant }.mapIndexed { index, lesson ->
        val stage = catalogue?.restoreCursor(lesson.id, settings.lessonStages?.get(lesson.id) ?: 0)?.stageIndex ?: 0
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

    return LearningOverview(allLessons.size, completed.size, course.count { it.completed }, course, suggested)
}
