package dev.sudoku.app.feature.learning

import dev.sudoku.app.model.learning.LessonCatalogue
import dev.sudoku.app.model.learning.LessonDirectoryEntry

internal sealed interface LessonProgressStatus {
    data object Unknown : LessonProgressStatus

    data object NotStarted : LessonProgressStatus

    data class InProgress(val stageIndex: Int) : LessonProgressStatus

    data object Completed : LessonProgressStatus
}

internal data class LearningLessonEntry(
    val lesson: LessonDirectoryEntry,
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

/** Build the course overview from authored order and durable progress. */
internal fun LearningDirectoryState.overview(): LearningOverview {
    val allLessons = directory
    val hasKnownProgress = epoch != null
    val directoryIds = allLessons.map { it.id }.toSet()
    val completedIds = progress.map { it.lessonId }.toSet().intersect(directoryIds)
    val selectedLessons = allLessons.filter { it.practiceVariant == selectedVariant }

    val course = selectedLessons.mapIndexed { index, lesson ->
        val stage =
            settings.lessonStages?.get(lesson.id)?.takeIf { it in 0 until lesson.stageCount } ?: 0
        val isCompleted = lesson.id in completedIds
        val isInProgress = lesson.id == settings.currentLessonId || stage > 0
        LearningLessonEntry(
            lesson = lesson,
            number = index + 1,
            status = when {
                !hasKnownProgress -> LessonProgressStatus.Unknown
                isCompleted -> LessonProgressStatus.Completed
                isInProgress -> LessonProgressStatus.InProgress(stage)
                else -> LessonProgressStatus.NotStarted
            }
        )
    }

    // Unknown personal facts cannot authorize a personalized recommendation.
    val unfinished = course.filterNot { it.completed }
    val suggested = if (!hasKnownProgress) {
        null
    } else {
        unfinished.firstOrNull { it.lesson.id == settings.currentLessonId }
            ?: unfinished.firstOrNull()
            ?: course.firstOrNull()
    }

    return LearningOverview(
        totalCount = LessonCatalogue.bundledLessonCount,
        completedCount = completedIds.size.takeIf { hasKnownProgress },
        courseCompleted = course.count { it.completed }.takeIf { hasKnownProgress },
        lessons = course,
        suggested = suggested
    )
}
