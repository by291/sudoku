package dev.yigeyinian.sudoku.feature.learning

import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.platform.app.InstrumentationRegistry
import dev.yigeyinian.sudoku.designsystem.YigeTheme
import dev.yigeyinian.sudoku.model.Placement
import dev.yigeyinian.sudoku.model.ThemePreference
import dev.yigeyinian.sudoku.model.learning.LessonCatalogue
import dev.yigeyinian.sudoku.model.learning.LessonCursor
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class LessonScreenTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun guideRequiresExerciseStartAndSavedCorrectAnswerStillRequiresNext() {
        val content = InstrumentationRegistry.getInstrumentation().context.assets
            .open("lessons/catalogue.json").bufferedReader().use { it.readText() }
        val catalogue = LessonCatalogue.decode(content)
        val lesson = checkNotNull(catalogue.lesson("rules"))
        val state = mutableStateOf(
            LearningUiState(
                loading = false,
                catalogue = catalogue,
                lessonId = "rules",
                cursor = LessonCursor("rules", 0),
                epoch = 0
            )
        )
        var nextActions = 0
        compose.setContent {
            YigeTheme(ThemePreference.LIGHT) {
                LessonScreen(
                    state = state.value,
                    onCell = { state.value = state.value.copy(selectedCell = it) },
                    onDigit = {
                        state.value = state.value.copy(
                            placement = Placement(checkNotNull(state.value.selectedCell), it)
                        )
                    },
                    onSubmit = {
                        state.value = state.value.copy(
                            feedback = ExerciseFeedback(
                                true,
                                lesson.guided.explanation,
                                LessonCursor("rules", 1),
                                false
                            )
                        )
                    },
                    onNext = {
                        nextActions++
                        state.value = state.value.copy(
                            cursor = LessonCursor("rules", 1),
                            feedback = null,
                            placement = null
                        )
                    },
                    onStart = { state.value = state.value.copy(exerciseStarted = true) },
                    onGuide = {},
                    onClear = {},
                    onPractice = {},
                    onBack = {},
                    onRetry = {}
                )
            }
        }

        compose.onNodeWithTag("lesson-explanation").performScrollTo().assertTextContains(lesson.explanation)
        compose.onNodeWithTag("submit-answer").assertDoesNotExist()
        compose.onNodeWithTag("start-exercise").performScrollTo().performClick()
        compose.onNodeWithTag("lesson-explanation").assertDoesNotExist()
        compose.onNodeWithText(lesson.guided.explanation).assertDoesNotExist()
        compose.onNodeWithTag("cell-40").performScrollTo().performClick()
        compose.onNodeWithContentDescription("填入数字5").performScrollTo().performClick()
        compose.onNodeWithTag("submit-answer").performScrollTo().performClick()

        compose.onNodeWithText(lesson.guided.explanation).performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("lesson-stage").performScrollTo().assertTextContains("第1 / 2阶段", substring = true)
        compose.runOnIdle { assertEquals(0, nextActions) }
        compose.onNodeWithTag("next-stage").performScrollTo().performClick()
        compose.onNodeWithTag("lesson-stage").performScrollTo().assertTextContains("第2 / 2阶段", substring = true)
        compose.runOnIdle { assertEquals(1, nextActions) }
    }
}
