package dev.yigeyinian.sudoku

import androidx.activity.BackEventCompat
import androidx.activity.ComponentActivity
import androidx.activity.compose.LocalActivity
import androidx.compose.material3.Text
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.navigation3.runtime.NavEntry
import dev.yigeyinian.sudoku.navigation.PlayerNavDisplay
import kotlinx.coroutines.CompletableDeferred
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class NavigationMotionTest {
    @get:Rule
    val compose = createComposeRule()

    private lateinit var activity: ComponentActivity

    @Test
    fun completedGestureKeepsItsPreviewWhileTheSaveIsPending() {
        val save = CompletableDeferred<Boolean>()
        showNavigation { save.await() }

        startGesture()
        compose.onNodeWithText("Home").assertExists()
        compose.runOnIdle { activity.onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()

        compose.onNodeWithText("Home").assertExists()
        compose.onNodeWithText("Game").assertExists()
        compose.runOnIdle { save.complete(true) }
        compose.waitForIdle()
        compose.onNodeWithText("Home").assertExists()
        compose.onNodeWithText("Game").assertDoesNotExist()
    }

    @Test
    fun rejectedLeaveReversesThePreviewAndAllowsAnotherGesture() {
        val save = CompletableDeferred<Boolean>()
        var attempts = 0
        showNavigation {
            attempts += 1
            if (attempts == 1) save.await() else true
        }

        startGesture()
        compose.runOnIdle { activity.onBackPressedDispatcher.onBackPressed() }
        compose.onNodeWithText("Home").assertExists()
        compose.runOnIdle { save.complete(false) }
        compose.waitForIdle()
        compose.onNodeWithText("Game").assertExists()
        compose.onNodeWithText("Home").assertDoesNotExist()

        startGesture()
        compose.runOnIdle { activity.onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()
        compose.onNodeWithText("Game").assertDoesNotExist()
        compose.onNodeWithText("Home").assertExists()
    }

    @Test
    fun cancelledGestureDoesNotStartTheSave() {
        var attempts = 0
        showNavigation {
            attempts += 1
            true
        }

        startGesture()
        compose.onNodeWithText("Home").assertExists()
        compose.runOnIdle { activity.onBackPressedDispatcher.dispatchOnBackCancelled() }
        compose.waitForIdle()

        assertEquals(0, attempts)
        compose.onNodeWithText("Game").assertExists()
        compose.onNodeWithText("Home").assertDoesNotExist()
    }

    private fun showNavigation(allowLeave: suspend () -> Boolean) {
        val stack = mutableStateListOf("Home", "Game")
        compose.setContent {
            activity = checkNotNull(LocalActivity.current as? ComponentActivity)
            PlayerNavDisplay(
                entries = stack.map { key -> NavEntry(key) { Text(key) } },
                onBack = {
                    if (allowLeave()) {
                        stack.removeLastOrNull()
                        true
                    } else {
                        false
                    }
                }
            )
        }
    }

    private fun startGesture() {
        compose.runOnIdle {
            activity.onBackPressedDispatcher.dispatchOnBackStarted(
                BackEventCompat(0f, 600f, 0f, BackEventCompat.EDGE_LEFT)
            )
            activity.onBackPressedDispatcher.dispatchOnBackProgressed(
                BackEventCompat(240f, 600f, 0.5f, BackEventCompat.EDGE_LEFT)
            )
        }
        compose.waitForIdle()
    }
}
