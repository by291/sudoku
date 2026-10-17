package dev.yigeyinian.sudoku.designsystem

import androidx.compose.foundation.layout.width
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import dev.yigeyinian.sudoku.model.ThemePreference
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class NumberPadTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun compactKeysStayInOneRowAndNarrowWindowsWrapWithoutLosingDigits() {
        val width = mutableStateOf(320.dp)
        var chosen = 0
        compose.setContent {
            YigeTheme(ThemePreference.LIGHT) {
                NumberPad(true, false, { chosen = it }, Modifier.width(width.value))
            }
        }

        val first = compose.onNodeWithContentDescription("填入数字1").fetchSemanticsNode().boundsInRoot
        val last = compose.onNodeWithContentDescription("填入数字9").fetchSemanticsNode().boundsInRoot
        assertEquals(first.top, last.top)
        compose.onNodeWithContentDescription("填入数字9").performClick()
        compose.runOnIdle {
            assertEquals(9, chosen)
            width.value = 240.dp
        }

        val wrappedFirst = compose.onNodeWithContentDescription("填入数字1").fetchSemanticsNode().boundsInRoot
        val wrappedLast = compose.onNodeWithContentDescription("填入数字9").fetchSemanticsNode().boundsInRoot
        assertTrue(wrappedLast.top > wrappedFirst.bottom)
        compose.onNodeWithContentDescription("填入数字9").performClick()
        compose.runOnIdle { assertEquals(9, chosen) }
    }

    @Test
    fun zoomOffersLargerTargetsAndDisabledKeysCannotEnterDigits() {
        val enabled = mutableStateOf(true)
        var chosen = 0
        compose.setContent {
            YigeTheme(ThemePreference.DARK) {
                NumberPad(enabled.value, true, { chosen = it }, Modifier.width(320.dp), expandedTargets = true)
            }
        }

        val first = compose.onNodeWithContentDescription("笔记数字1").fetchSemanticsNode().boundsInRoot
        val last = compose.onNodeWithContentDescription("笔记数字9").fetchSemanticsNode().boundsInRoot
        assertTrue(last.top > first.bottom)
        compose.onNodeWithContentDescription("笔记数字7").performClick()
        compose.runOnIdle {
            assertEquals(7, chosen)
            enabled.value = false
        }
        compose.onNodeWithContentDescription("笔记数字9").assertIsNotEnabled().performClick()
        compose.runOnIdle { assertEquals(7, chosen) }
    }
}
