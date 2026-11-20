package dev.sudoku.app.designsystem

import androidx.compose.foundation.layout.width
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import dev.sudoku.app.model.ThemePreference
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** Checks digit activation across keypad layouts and disabled states. */
class NumberPadTest {
    @get:Rule val compose = createComposeRule()

    /** Checks that the same digit remains operable after wrapping. */
    @Test
    fun compactKeysStayInOneRowAndNarrowWindowsWrapWithoutLosingDigits() {
        val width = mutableStateOf(320.dp)
        var chosen: Int? = null
        compose.setContent {
            SudokuTheme(ThemePreference.LIGHT) {
                NumberPad(
                    enabled = true,
                    noteMode = false,
                    onDigit = { chosen = it },
                    modifier = Modifier.width(width.value)
                )
            }
        }

        val first = compose.onNodeWithContentDescription("填入数字1").fetchSemanticsNode().boundsInRoot
        val last = compose.onNodeWithContentDescription("填入数字9").fetchSemanticsNode().boundsInRoot
        assertEquals(first.top, last.top)
        compose.onNodeWithContentDescription("填入数字9").performClick()
        compose.runOnIdle {
            assertEquals(9, chosen)
            chosen = null
            width.value = 240.dp
        }

        val wrappedFirst = compose.onNodeWithContentDescription(
            "填入数字1"
        ).fetchSemanticsNode().boundsInRoot
        val wrappedLast = compose.onNodeWithContentDescription(
            "填入数字9"
        ).fetchSemanticsNode().boundsInRoot
        assertTrue(wrappedLast.top > wrappedFirst.bottom)
        compose.onNodeWithContentDescription("填入数字9").performClick()
        compose.runOnIdle { assertEquals(9, chosen) }
    }

    /** Checks that disabling expanded keys suppresses digit callbacks. */
    @Test
    fun zoomOffersLargerTargetsAndDisabledKeysCannotEnterDigits() {
        val enabled = mutableStateOf(true)
        var chosen: Int? = null
        compose.setContent {
            SudokuTheme(ThemePreference.DARK) {
                NumberPad(
                    enabled = enabled.value,
                    noteMode = true,
                    onDigit = { chosen = it },
                    modifier = Modifier.width(320.dp),
                    expandedTargets = true
                )
            }
        }

        val first = compose.onNodeWithContentDescription("笔记数字1").fetchSemanticsNode().boundsInRoot
        val last = compose.onNodeWithContentDescription("笔记数字9").fetchSemanticsNode().boundsInRoot
        assertTrue(last.top > first.bottom)
        compose.onNodeWithContentDescription("笔记数字7").performClick()
        compose.runOnIdle {
            assertEquals(7, chosen)
            chosen = null
            enabled.value = false
        }
        compose.onNodeWithContentDescription("笔记数字9").assertIsNotEnabled().performClick()
        compose.runOnIdle { assertNull(chosen) }
    }
}
