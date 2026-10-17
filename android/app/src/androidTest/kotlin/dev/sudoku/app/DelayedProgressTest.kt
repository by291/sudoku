package dev.sudoku.app

import androidx.compose.material3.Text
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import dev.sudoku.app.design.rememberDelayedProgress
import org.junit.Rule
import org.junit.Test

class DelayedProgressTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun suppressesProgressWhenWorkFinishesQuickly() {
        val active = mutableStateOf(true)
        compose.mainClock.autoAdvance = false
        compose.setContent { if (rememberDelayedProgress(active.value)) Text("处理中") }

        compose.mainClock.advanceTimeBy(100)
        compose.onNodeWithText("处理中").assertDoesNotExist()
        compose.runOnIdle { active.value = false }
        compose.mainClock.advanceTimeBy(1_000)

        compose.onNodeWithText("处理中").assertDoesNotExist()
    }

    @Test
    fun showsLongRunningWorkAndHidesImmediatelyOnCompletion() {
        val active = mutableStateOf(true)
        compose.mainClock.autoAdvance = false
        compose.setContent { if (rememberDelayedProgress(active.value)) Text("处理中") }

        compose.mainClock.advanceTimeBy(500)
        compose.onNodeWithText("处理中").assertIsDisplayed()
        compose.runOnIdle { active.value = false }
        compose.mainClock.advanceTimeByFrame()

        compose.onNodeWithText("处理中").assertDoesNotExist()
    }

    @Test
    fun startsAFreshDelayForEachOperation() {
        val active = mutableStateOf(true)
        compose.mainClock.autoAdvance = false
        compose.setContent { if (rememberDelayedProgress(active.value)) Text("处理中") }

        compose.mainClock.advanceTimeBy(250)
        compose.runOnIdle { active.value = false }
        compose.mainClock.advanceTimeByFrame()
        compose.runOnIdle { active.value = true }
        compose.mainClock.advanceTimeBy(150)
        compose.onNodeWithText("处理中").assertDoesNotExist()
        compose.mainClock.advanceTimeBy(500)

        compose.onNodeWithText("处理中").assertIsDisplayed()
    }

    @Test
    fun cancelsPendingFeedbackWhenTheScreenLeavesComposition() {
        val mounted = mutableStateOf(true)
        compose.mainClock.autoAdvance = false
        compose.setContent { if (mounted.value && rememberDelayedProgress(true)) Text("处理中") }

        compose.mainClock.advanceTimeBy(100)
        compose.runOnIdle { mounted.value = false }
        compose.mainClock.advanceTimeBy(1_000)
        compose.onNodeWithText("处理中").assertDoesNotExist()
        compose.runOnIdle { mounted.value = true }
        compose.mainClock.advanceTimeBy(100)

        compose.onNodeWithText("处理中").assertDoesNotExist()
        compose.mainClock.advanceTimeBy(500)
        compose.onNodeWithText("处理中").assertIsDisplayed()
    }
}
