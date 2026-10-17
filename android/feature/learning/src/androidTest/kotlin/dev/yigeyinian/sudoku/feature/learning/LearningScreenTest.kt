package dev.yigeyinian.sudoku.feature.learning

import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.test.platform.app.InstrumentationRegistry
import dev.yigeyinian.sudoku.designsystem.YigeTheme
import dev.yigeyinian.sudoku.designsystem.variantLabel
import dev.yigeyinian.sudoku.model.LessonProgress
import dev.yigeyinian.sudoku.model.Settings
import dev.yigeyinian.sudoku.model.ThemePreference
import dev.yigeyinian.sudoku.model.Variant
import dev.yigeyinian.sudoku.model.learning.LessonCatalogue
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class LearningScreenTest {
    @get:Rule val compose = createComposeRule()

    private fun catalogue(): LessonCatalogue = LessonCatalogue.decode(
        InstrumentationRegistry.getInstrumentation().context.assets.open("lessons/catalogue.json")
            .bufferedReader().use { it.readText() }
    )

    @Test
    fun everyVariantIsSelectableAndOffersItsOwnFirstLesson() {
        val catalogue = catalogue()
        val state = mutableStateOf(LearningUiState(loading = false, catalogue = catalogue))
        var opened: String? = null
        compose.setContent {
            YigeTheme(ThemePreference.SYSTEM) {
                LearningScreen(state.value, {
                    state.value = state.value.copy(selectedVariant = it)
                }, { opened = it }, {})
            }
        }

        Variant.entries.forEach { variant ->
            compose.onNodeWithContentDescription(
                variantLabel(variant)
            ).performScrollTo().performClick().assertIsSelected()
            compose.onNodeWithTag("suggested-lesson-action").performScrollTo().performClick()

            compose.runOnIdle {
                assertEquals(catalogue.lessons.first { it.practiceVariant == variant }.id, opened)
            }
        }
    }

    @Test
    fun savedCourseCanBeContinuedAndAnyLaterLessonCanBeOpened() {
        val state = LearningUiState(
            loading = false,
            catalogue = catalogue(),
            settings = Settings(currentLessonId = "hidden-single", lessonStages = mapOf("hidden-single" to 1)),
            progress = listOf(LessonProgress("rules", "2026-10-17T00:00:00.000Z"))
        )
        var opened: String? = null
        compose.setContent {
            YigeTheme(ThemePreference.SYSTEM) {
                LearningScreen(state, {}, { opened = it }, {})
            }
        }

        compose.onNodeWithTag("suggested-lesson-action").performScrollTo().assertTextContains("继续学习").performClick()
        compose.runOnIdle { assertEquals("hidden-single", opened) }
        compose.onNodeWithText("第 2 / 2 阶段").performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("learning-courses").performScrollToNode(hasTestTag("lesson-simple-coloring"))
        compose.onNodeWithTag("lesson-simple-coloring").performClick()
        compose.runOnIdle { assertEquals("simple-coloring", opened) }
    }

    @Test
    fun completedCourseOffersReviewAndLoadingCannotOpenAnUnreadyLesson() {
        val catalogue = catalogue()
        val state = mutableStateOf(
            LearningUiState(
                loading = false,
                catalogue = catalogue,
                progress = catalogue.lessons.map { LessonProgress(it.id, "2026-10-17T00:00:00.000Z") }
            )
        )
        var opened: String? = null
        compose.setContent {
            YigeTheme(ThemePreference.SYSTEM) {
                LearningScreen(state.value, {}, { opened = it }, {})
            }
        }

        compose.onNodeWithTag("suggested-lesson-action").performScrollTo().assertTextContains("复习课程").performClick()
        compose.runOnIdle { assertEquals("rules", opened) }
        compose.runOnIdle { state.value = state.value.copy(loading = true) }
        compose.onNodeWithTag("suggested-lesson-action").assertDoesNotExist()
    }
}
