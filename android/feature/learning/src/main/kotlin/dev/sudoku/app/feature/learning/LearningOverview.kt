package dev.sudoku.app.feature.learning

import dev.sudoku.app.model.learning.LessonCatalogue

internal sealed interface LessonProgressStatus {
    data object Unknown : LessonProgressStatus

    data object NotStarted : LessonProgressStatus

    data class InProgress(val stageIndex: Int) : LessonProgressStatus

    data object Completed : LessonProgressStatus
}

internal data class LearningLessonEntry(
    val lesson: dev.sudoku.app.model.learning.LessonDirectoryEntry,
    val number: Int,
    val status: LessonProgressStatus
) {
    val completed get() = status is LessonProgressStatus.Completed
    val inProgress get() = status is LessonProgressStatus.InProgress
    val stageIndex: Int? get() = when (val progress = status) {
        is LessonProgressStatus.InProgress -> progress.stageIndex
        LessonProgressStatus.Unknown -> null
        LessonProgressStatus.Completed, LessonProgressStatus.NotStarted -> 0
    }
}

internal data class LearningOverview(
    val totalCount: Int,
    val completedCount: Int?,
    val courseCompleted: Int?,
    val lessons: List<LearningLessonEntry>,
    val suggested: LearningLessonEntry?
)

/** Derives presentation from authored course order and durable progress without advancing any lesson. */
internal fun LearningDirectoryState.overview(): LearningOverview {
    val allLessons = directory
    val known = epoch != null
    val completed = progress.map { it.lessonId }.toSet().intersect(allLessons.map { it.id }.toSet())
    val course = allLessons.filter { it.practiceVariant == selectedVariant }.mapIndexed { index, lesson ->
        val stage = settings.lessonStages?.get(lesson.id)?.takeIf { it in 0 until lesson.stageCount } ?: 0
        val isCompleted = lesson.id in completed
        LearningLessonEntry(
            lesson = lesson,
            number = index + 1,
            status = when {
                !known -> LessonProgressStatus.Unknown
                isCompleted -> LessonProgressStatus.Completed
                lesson.id == settings.currentLessonId || stage > 0 -> LessonProgressStatus.InProgress(stage)
                else -> LessonProgressStatus.NotStarted
            }
        )
    }
    val unfinished = course.filterNot { it.completed }
    val suggested = if (!known) {
        null
    } else {
        unfinished.firstOrNull { it.lesson.id == settings.currentLessonId }
            ?: unfinished.firstOrNull()
            ?: course.firstOrNull()
    }

    return LearningOverview(
        LessonCatalogue.bundledLessonCount,
        completed.size.takeIf { known },
        course.count { it.completed }.takeIf { known },
        course,
        suggested
    )
}
