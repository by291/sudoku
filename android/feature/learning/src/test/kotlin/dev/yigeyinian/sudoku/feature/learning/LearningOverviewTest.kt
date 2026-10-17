package dev.yigeyinian.sudoku.feature.learning

import dev.yigeyinian.sudoku.model.LessonProgress
import dev.yigeyinian.sudoku.model.Settings
import dev.yigeyinian.sudoku.model.Variant
import dev.yigeyinian.sudoku.model.learning.LessonCatalogue
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LearningOverviewTest {
    private val catalogue = LessonCatalogue.decode(
        checkNotNull(javaClass.classLoader.getResourceAsStream("lessons/catalogue.json"))
            .bufferedReader().use { it.readText() }
    )

    @Test
    fun bundledCourseCountIsAvailableBeforeLoadingProgress() {
        val pending = LearningUiState().overview()

        assertEquals(32, pending.totalCount)
        assertEquals(catalogue.lessons.size, pending.totalCount)
    }

    @Test
    fun newLearnerStartsWithFirstLessonInSelectedCourse() {
        val overview = LearningUiState(loading = false, catalogue = catalogue).overview()

        assertEquals(32, overview.totalCount)
        assertEquals(0, overview.completedCount)
        assertEquals(12, overview.lessons.size)
        assertEquals("rules", overview.suggested?.lesson?.id)
        assertFalse(checkNotNull(overview.suggested).inProgress)
    }

    @Test
    fun unfinishedCurrentLessonTakesPriorityAndKeepsItsSavedStage() {
        val overview = LearningUiState(
            loading = false,
            catalogue = catalogue,
            settings = Settings(currentLessonId = "hidden-single", lessonStages = mapOf("hidden-single" to 1)),
            progress = listOf(completed("rules"), completed("removed-legacy-lesson"))
        ).overview()

        assertEquals(1, overview.completedCount)
        assertEquals(1, overview.courseCompleted)
        assertEquals("hidden-single", overview.suggested?.lesson?.id)
        assertEquals(1, overview.suggested?.stageIndex)
        assertTrue(checkNotNull(overview.suggested).inProgress)
    }

    @Test
    fun completedCurrentLessonAdvancesToFirstUnfinishedLesson() {
        val overview = LearningUiState(
            loading = false,
            catalogue = catalogue,
            settings = Settings(currentLessonId = "rules"),
            progress = listOf(completed("rules"))
        ).overview()

        assertEquals("naked-single", overview.suggested?.lesson?.id)
        assertFalse(checkNotNull(overview.suggested).completed)
    }

    @Test
    fun switchingCourseNeverSuggestsAnotherVariantsSavedLesson() {
        val overview = LearningUiState(
            loading = false,
            catalogue = catalogue,
            selectedVariant = Variant.DIAGONAL,
            settings = Settings(currentLessonId = "hidden-single")
        ).overview()

        assertEquals(4, overview.lessons.size)
        assertEquals("diagonal-rules", overview.suggested?.lesson?.id)
        assertEquals(1, overview.lessons.first().number)
        assertFalse(checkNotNull(overview.suggested).inProgress)
    }

    @Test
    fun completedCourseOffersReviewWithoutReopeningCompletion() {
        val overview = LearningUiState(
            loading = false,
            catalogue = catalogue,
            progress = catalogue.lessons.filter { it.practiceVariant == Variant.CLASSIC }.map { completed(it.id) }
        ).overview()

        assertEquals(12, overview.courseCompleted)
        assertEquals("rules", overview.suggested?.lesson?.id)
        assertTrue(checkNotNull(overview.suggested).completed)
        assertFalse(checkNotNull(overview.suggested).inProgress)
    }

    private fun completed(id: String) = LessonProgress(id, "2026-10-17T00:00:00.000Z")
}
