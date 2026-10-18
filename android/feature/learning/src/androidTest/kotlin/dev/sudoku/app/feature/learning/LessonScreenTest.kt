package dev.sudoku.app.feature.learning

import android.graphics.Bitmap
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.input.InputMode
import androidx.compose.ui.input.InputModeManager
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.platform.LocalInputModeManager
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.pressKey
import androidx.test.platform.app.InstrumentationRegistry
import dev.sudoku.app.designsystem.SudokuTheme
import dev.sudoku.app.model.GameLaunch
import dev.sudoku.app.model.Placement
import dev.sudoku.app.model.ThemePreference
import dev.sudoku.app.model.learning.ExerciseAnswer
import dev.sudoku.app.model.learning.LessonCatalogue
import dev.sudoku.app.model.learning.LessonCursor
import dev.sudoku.app.model.learning.directoryEntry
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Rule
import org.junit.Test

class LessonScreenTest {
    @get:Rule val compose = createComposeRule()
    private lateinit var inputMode: InputModeManager
    private var nextActions = 0
    private var practice: GameLaunch.Practice? = null

    private fun showLesson(id: String = "naked-single", pending: Boolean = false): MutableState<LearningUiState> {
        val content = InstrumentationRegistry.getInstrumentation().context.assets
            .open("lessons/catalogue.json").bufferedReader().use { it.readText() }
        val catalogue = LessonCatalogue.decode(content)
        val state = mutableStateOf(
            LearningUiState(
                loading = pending,
                catalogue = if (pending) null else catalogue,
                directory = catalogue.lessons.map { it.directoryEntry() },
                lessonId = id,
                cursor = if (pending) null else LessonCursor(id, 0),
                epoch = if (pending) null else 0
            )
        )
        compose.setContent {
            inputMode = LocalInputModeManager.current
            SudokuTheme(ThemePreference.SYSTEM) {
                LessonScreen(
                    state = state.value,
                    onCell = { state.value = state.value.copy(selectedCell = it) },
                    onDigit = {
                        val old = state.value
                        val pair = Placement(checkNotNull(old.selectedCell), it)
                        state.value = if (old.stage?.answer is ExerciseAnswer.Eliminate) {
                            old.copy(
                                removals = if (pair in old.removals) old.removals - pair else old.removals + pair,
                                feedback = null
                            )
                        } else {
                            old.copy(placement = pair, feedback = null)
                        }
                    },
                    onSubmit = {
                        val old = state.value
                        val answer = if (old.stage?.answer is ExerciseAnswer.Eliminate) {
                            ExerciseAnswer.Eliminate(old.removals.toList())
                        } else {
                            ExerciseAnswer.Place(checkNotNull(old.placement))
                        }
                        val result = catalogue.submit(checkNotNull(old.cursor), answer)
                        state.value = old.copy(
                            feedback = when (result) {
                                is dev.sudoku.app.model.learning.ExerciseSubmission.Rejected ->
                                    ExerciseFeedback.Incorrect(result.explanation)
                                is dev.sudoku.app.model.learning.ExerciseSubmission.Accepted ->
                                    ExerciseFeedback.Saved(result)
                            }
                        )
                    },
                    onNext = {
                        nextActions++
                        state.value = state.value.copy(
                            cursor = state.value.feedback?.nextCursor,
                            feedback = null,
                            placement = null,
                            removals = emptySet(),
                            selectedCell = null
                        )
                    },
                    onStart = { state.value = state.value.copy(exerciseStarted = true) },
                    onGuide = { state.value = state.value.copy(exerciseStarted = false) },
                    onClear = {
                        state.value = state.value.copy(placement = null, removals = emptySet(), feedback = null)
                    },
                    onPractice = { practice = it }, onBack = {}, onRetry = {}
                )
            }
        }
        return state
    }

    private fun capture(name: String) {
        if (InstrumentationRegistry.getArguments().getString("captureLessons") != "true") return
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.getExternalFilesDir(null), "$name.png")
        compose.waitForIdle()
        val screenshot = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
        file.outputStream().use { stream ->
            screenshot.compress(Bitmap.CompressFormat.PNG, 100, stream)
        }
        screenshot.recycle()
    }

    @Test
    fun delayedLessonPreservesHeaderTabsBoardAndActionBounds() {
        val state = showLesson("rules", pending = true)
        compose.onNodeWithText("认识数独").assertIsDisplayed()
        compose.onNodeWithText("学习讲解").assertIsDisplayed()
        compose.onNodeWithTag("start-exercise").assertIsNotEnabled()
        capture("lesson-loading")
        val board = compose.onNodeWithTag("lesson-board").fetchSemanticsNode().boundsInRoot
        val header = compose.onNodeWithTag("lesson-header").fetchSemanticsNode().boundsInRoot
        val action = compose.onNodeWithTag("start-exercise").fetchSemanticsNode().boundsInRoot
        val content = InstrumentationRegistry.getInstrumentation().context.assets
            .open("lessons/catalogue.json").bufferedReader().use { it.readText() }
        val catalogue = LessonCatalogue.decode(content)

        compose.runOnIdle { state.value = state.value.copy(catalogue = catalogue) }
        compose.onNodeWithTag("start-exercise").assertIsNotEnabled()
        assertEquals(board, compose.onNodeWithTag("lesson-board").fetchSemanticsNode().boundsInRoot)
        compose.runOnIdle {
            state.value =
                state.value.copy(loading = false, epoch = 0, cursor = LessonCursor("rules", 0))
        }

        assertEquals(board, compose.onNodeWithTag("lesson-board").fetchSemanticsNode().boundsInRoot)
        capture("lesson-loaded")
        assertEquals(header, compose.onNodeWithTag("lesson-header").fetchSemanticsNode().boundsInRoot)
        assertEquals(action, compose.onNodeWithTag("start-exercise").fetchSemanticsNode().boundsInRoot)
    }

    @Test
    fun guideRequiresExerciseStartAndSavedCorrectAnswerStillRequiresNext() {
        val state = showLesson()
        capture("lesson-guide")
        compose.onNodeWithTag("lesson-explanation").performScrollTo()
            .assertTextContains(checkNotNull(state.value.lesson).explanation)
        compose.onNodeWithTag("submit-answer").assertDoesNotExist()
        compose.onNodeWithTag("start-exercise").assertIsDisplayed().performClick()
        compose.onNodeWithTag("lesson-explanation").assertDoesNotExist()
        compose.onNodeWithTag("cell-40").performScrollTo().performClick()
        compose.onNodeWithContentDescription("填入数字5").performScrollTo().performClick()
        capture("lesson-practice")
        compose.onNodeWithTag("submit-answer").assertIsDisplayed().performClick()
        compose.onNodeWithTag("exercise-message").performScrollTo()
        compose.onNodeWithText("推理正确").performScrollTo().assertIsDisplayed()
        compose.runOnIdle {
            assertEquals(0, nextActions)
            assertEquals(0, state.value.cursor?.stageIndex)
        }
        capture("lesson-correct")
        compose.onNodeWithTag("next-stage").assertIsDisplayed().performClick()
        compose.runOnIdle {
            assertEquals(1, nextActions)
            assertEquals(1, state.value.cursor?.stageIndex)
        }
    }

    @Test
    fun feedbackDoesNotMoveBoardOrKeysAndGuidePreservesTheAnswer() {
        val state = showLesson()
        compose.onNodeWithText("动手练习").performClick().assertIsSelected()
        compose.onNodeWithTag("cell-40").performScrollTo().performClick()
        compose.onNodeWithContentDescription("填入数字4").performScrollTo().performClick()
        val board = compose.onNodeWithTag("lesson-board").fetchSemanticsNode().boundsInRoot
        val key = compose.onNodeWithContentDescription("填入数字4").fetchSemanticsNode().boundsInRoot
        val submit = compose.onNodeWithTag("submit-answer").fetchSemanticsNode().boundsInRoot

        compose.onNodeWithTag("submit-answer").performClick()
        compose.runOnIdle { assertEquals(false, state.value.feedback?.correct) }
        assertEquals(board, compose.onNodeWithTag("lesson-board").fetchSemanticsNode().boundsInRoot)
        assertEquals(key, compose.onNodeWithContentDescription("填入数字4").fetchSemanticsNode().boundsInRoot)
        assertEquals(submit, compose.onNodeWithTag("submit-answer").fetchSemanticsNode().boundsInRoot)
        compose.onNodeWithText("学习讲解").performClick()
        compose.onNodeWithTag("start-exercise").assertTextContains("返回当前练习").performClick()
        compose.runOnIdle { assertEquals(Placement(40, 4), state.value.placement) }
        compose.runOnIdle { inputMode.requestInputMode(InputMode.Keyboard) }
        compose.onNodeWithTag("cell-40").performScrollTo().performClick().assertIsFocused().performKeyInput {
            pressKey(Key.Five)
        }
        compose.runOnIdle { assertEquals(Placement(40, 5), state.value.placement) }
    }

    @Test
    fun candidateEliminationCanBeToggledClearedAndSubmitted() {
        val state = showLesson("locked-candidate")
        compose.onNodeWithTag("start-exercise").performClick()
        compose.onNodeWithTag("cell-24").performScrollTo().performClick()
        val digit = compose.onNodeWithContentDescription("排除候选数3")
        digit.performScrollTo().performClick()
        compose.runOnIdle { assertEquals(setOf(Placement(24, 3)), state.value.removals) }
        digit.performClick()
        compose.runOnIdle { assertEquals(emptySet<Placement>(), state.value.removals) }
        digit.performClick()
        compose.onNodeWithText("清空").performScrollTo().performClick()
        compose.runOnIdle { assertEquals(emptySet<Placement>(), state.value.removals) }
        digit.performScrollTo().performClick()
        capture("lesson-elimination")
        compose.onNodeWithTag("submit-answer").performClick()
        compose.runOnIdle { assertEquals(true, state.value.feedback?.correct) }
        digit.assertIsNotEnabled()
        compose.onNodeWithTag("next-stage").assertIsDisplayed()
    }

    @Test
    fun switchingTabsPreservesToolbarTabsAndBoardAtBothScrollPositions() {
        showLesson("rules")
        val header = compose.onNodeWithTag("lesson-header").fetchSemanticsNode().boundsInRoot
        val tabs = compose.onNodeWithText("学习讲解").fetchSemanticsNode().boundsInRoot
        val initialBoard = compose.onNodeWithTag("lesson-board").fetchSemanticsNode().boundsInRoot
        capture("tab-guide")

        compose.onNodeWithText("动手练习").performClick()
        assertEquals(initialBoard, compose.onNodeWithTag("lesson-board").fetchSemanticsNode().boundsInRoot)
        capture("tab-practice")
        compose.onNodeWithText("清空").performScrollTo()
        val scrolledBoard = compose.onNodeWithTag("lesson-board").fetchSemanticsNode().boundsInRoot
        compose.onNodeWithText("学习讲解").assertIsDisplayed().performClick()
        assertEquals(scrolledBoard, compose.onNodeWithTag("lesson-board").fetchSemanticsNode().boundsInRoot)
        compose.onNodeWithText("动手练习").performClick()
        assertEquals(scrolledBoard, compose.onNodeWithTag("lesson-board").fetchSemanticsNode().boundsInRoot)
        assertEquals(header, compose.onNodeWithTag("lesson-header").fetchSemanticsNode().boundsInRoot)
        assertEquals(tabs, compose.onNodeWithText("学习讲解").fetchSemanticsNode().boundsInRoot)
    }

    @Test
    fun secondaryActionsKeepZoomAndFullBoardPracticeReachable() {
        showLesson()
        compose.onNodeWithContentDescription("课程更多选项").performClick()
        compose.onNodeWithText("放大棋盘").performClick()
        compose.onNodeWithText("关闭放大棋盘").assertIsDisplayed().performClick()
        compose.onNodeWithContentDescription("课程更多选项").performClick()
        compose.onNodeWithText("进入完整棋盘练习").performClick()
        compose.runOnIdle {
            assertNotNull(practice)
            assertEquals("naked-single", practice?.lessonId)
        }
    }
}
