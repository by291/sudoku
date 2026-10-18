package dev.sudoku.app.game

import android.graphics.Bitmap
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipe
import androidx.test.platform.app.InstrumentationRegistry
import dev.sudoku.app.designsystem.SudokuTheme
import dev.sudoku.app.model.Difficulty
import dev.sudoku.app.model.GameSummary
import dev.sudoku.app.model.SessionMetadata
import dev.sudoku.app.model.SummaryItem
import dev.sudoku.app.model.Variant
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class GameEntrySheetTest {
    @get:Rule val compose = createComposeRule()

    @Test fun saveArrivingDuringEntranceWaitsBeforeExpandingSetup() {
        val state = mutableStateOf(GameEntryUiState(sheetLoading = true))
        compose.mainClock.autoAdvance = false
        compose.setContent { SudokuTheme { GameSetupSheet(state.value, {}, {}) } }
        compose.mainClock.advanceTimeBy(80)

        compose.runOnIdle { state.value = state.value.copy(sheetLoading = false, freeSave = save("early").summary) }
        compose.mainClock.advanceTimeBy(80)
        compose.onNodeWithText("继续存档").assertDoesNotExist()
        compose.onNodeWithTag("setup-start").assertIsNotEnabled()

        compose.mainClock.advanceTimeBy(800)
        compose.onNodeWithText("继续存档").assertIsDisplayed()
    }

    @Test fun delayedSaveListShrinksThenKeepsRowsStableOnRefresh() {
        val state = mutableStateOf(GameEntryUiState(sheetLoading = true))
        var resumed: String? = null
        compose.setContent {
            SudokuTheme {
                ContinueGameSheet(
                    state.value.saves,
                    {},
                    { resumed = it },
                    loading = state.value.sheetLoading,
                    error = state.value.sheetError
                )
            }
        }
        compose.mainClock.advanceTimeBy(500)
        compose.onNodeWithTag("continue-skeleton").assertIsDisplayed()
        capture("continue-loading")
        val header = compose.onNodeWithText("继续存档").fetchSemanticsNode().boundsInRoot

        compose.runOnIdle {
            state.value =
                state.value.copy(sheetLoading = false, saves = listOf(save("first"), save("second")))
        }
        compose.waitForIdle()
        val compactHeader = compose.onNodeWithText("继续存档").fetchSemanticsNode().boundsInRoot
        assertTrue(compactHeader.top > header.top)
        capture("continue-loaded")
        val row = compose.onNodeWithTag("continue-save-first").fetchSemanticsNode().boundsInRoot
        compose.runOnIdle { state.value = state.value.copy(sheetLoading = true) }
        compose.mainClock.advanceTimeBy(500)
        assertEquals(row, compose.onNodeWithTag("continue-save-first").fetchSemanticsNode().boundsInRoot)
        compose.onNodeWithTag("continue-skeleton").assertDoesNotExist()
        compose.runOnIdle {
            state.value =
                state.value.copy(sheetLoading = false, saves = state.value.saves + (1..20).map { save("more-$it") })
        }
        compose.onNodeWithTag("continue-save-first").assertIsDisplayed().performClick()
        compose.runOnIdle { assertEquals("first", resumed) }
    }

    @Test fun freeSaveExpandsGraduallyWhileTheStartButtonStaysAtTheBottom() {
        val state = mutableStateOf(GameEntryUiState(sheetLoading = true))
        compose.setContent { SudokuTheme { GameSetupSheet(state.value, {}, {}) } }
        compose.mainClock.advanceTimeBy(500)
        compose.waitForIdle()
        compose.onNodeWithText("读取中…").assertIsNotEnabled()
        val top = compose.onNodeWithText("开始一局").fetchSemanticsNode().boundsInRoot.top
        val button = compose.onNodeWithTag("setup-start").fetchSemanticsNode().boundsInRoot
        capture("setup-compact")
        compose.mainClock.autoAdvance = false

        compose.runOnIdle { state.value = state.value.copy(sheetLoading = false, freeSave = save("free").summary) }
        compose.mainClock.advanceTimeBy(80)
        val intermediate = compose.onNodeWithText("开始一局").fetchSemanticsNode().boundsInRoot.top
        assertEquals(button, compose.onNodeWithTag("setup-start").fetchSemanticsNode().boundsInRoot)
        compose.mainClock.advanceTimeBy(600)
        val expanded = compose.onNodeWithText("开始一局").fetchSemanticsNode().boundsInRoot.top

        assertTrue(
            "The sheet must expand through an intermediate position",
            intermediate < top && intermediate > expanded
        )
        assertEquals(button, compose.onNodeWithTag("setup-start").fetchSemanticsNode().boundsInRoot)
        capture("setup-expanded")
        compose.onNodeWithText("继续存档").assertIsDisplayed()
    }

    @Test fun noSaveKeepsSetupCompactWithoutAnEmptySaveRegion() {
        val state = mutableStateOf(GameEntryUiState(sheetLoading = true))
        compose.setContent { SudokuTheme { GameSetupSheet(state.value, {}, {}) } }
        compose.waitForIdle()
        val header = compose.onNodeWithText("开始一局").fetchSemanticsNode().boundsInRoot
        compose.runOnIdle { state.value = state.value.copy(sheetLoading = false) }
        compose.waitForIdle()
        assertEquals(header, compose.onNodeWithText("开始一局").fetchSemanticsNode().boundsInRoot)
        compose.onNodeWithText("继续存档").assertDoesNotExist()
    }

    @Test fun fastSaveQueryKeepsSkeletonUntilRowsCanBeRevealed() {
        val loading = mutableStateOf(true)
        compose.mainClock.autoAdvance = false
        compose.setContent {
            SudokuTheme {
                ContinueGameSheet(if (loading.value) emptyList() else listOf(save("fast")), {}, {}, loading.value)
            }
        }
        compose.mainClock.advanceTimeBy(80)
        compose.onNodeWithTag("continue-skeleton").assertExists()
        compose.runOnIdle { loading.value = false }
        compose.mainClock.advanceTimeBy(32)
        compose.onNodeWithTag("continue-save-fast").assertDoesNotExist()
        compose.onNodeWithTag("continue-skeleton").assertExists()
        compose.mainClock.autoAdvance = true
        compose.waitForIdle()
        compose.onNodeWithTag("continue-skeleton").assertDoesNotExist()
        compose.onNodeWithTag("continue-save-fast").assertIsDisplayed()
    }

    @Test fun setupErrorArrivingDuringEntranceWaitsBeforeResizing() {
        val state = mutableStateOf(GameEntryUiState(sheetLoading = true))
        compose.mainClock.autoAdvance = false
        compose.setContent { SudokuTheme { GameSetupSheet(state.value, {}, {}) } }
        compose.mainClock.advanceTimeBy(80)

        compose.runOnIdle { state.value = state.value.copy(sheetLoading = false, sheetError = "读取失败") }
        compose.mainClock.advanceTimeBy(80)
        compose.onNodeWithText("读取失败").assertDoesNotExist()

        compose.mainClock.advanceTimeBy(800)
        compose.onNodeWithText("读取失败").assertIsDisplayed()
        compose.onNodeWithTag("setup-start").assertIsNotEnabled()
    }

    @Test fun preloadedSaveContentIsIncludedInTheInitialSheet() {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            SudokuTheme { GameSetupSheet(GameEntryUiState(freeSave = save("cached").summary), {}, {}) }
        }
        compose.mainClock.advanceTimeBy(80)
        compose.onNodeWithText("继续存档").assertExists()
        compose.mainClock.advanceTimeBy(800)
        compose.onNodeWithText("继续存档").assertIsDisplayed()
    }

    @Test fun failedAndEmptyQueriesStayVisibleAndAllowRetry() {
        val state = mutableStateOf(GameEntryUiState(sheetLoading = true))
        var retries = 0
        compose.setContent {
            SudokuTheme {
                ContinueGameSheet(
                    state.value.saves,
                    {},
                    {},
                    state.value.sheetLoading,
                    state.value.sheetError,
                    onRetry = { retries++ }
                )
            }
        }
        compose.mainClock.advanceTimeBy(500)
        val viewport = compose.onNodeWithTag("continue-viewport").fetchSemanticsNode().boundsInRoot
        compose.runOnIdle { state.value = state.value.copy(sheetLoading = false, sheetError = "读取失败") }
        compose.onNodeWithText("重新读取").performClick()
        compose.mainClock.autoAdvance = false
        compose.runOnIdle {
            assertEquals(1, retries)
            state.value = state.value.copy(sheetError = null, sheetLoading = true)
        }
        compose.mainClock.advanceTimeBy(32)
        compose.onNodeWithTag("continue-skeleton").assertExists()
        compose.runOnIdle { state.value = state.value.copy(sheetLoading = false) }
        compose.mainClock.autoAdvance = true
        compose.waitForIdle()
        compose.onNodeWithText("暂无未完成的存档").assertIsDisplayed()
        assertTrue(
            compose.onNodeWithTag("continue-viewport").fetchSemanticsNode().boundsInRoot.height < viewport.height
        )
    }

    @Test fun savedGamesOpenHalfwayAndCanExpandAndScrollToTheLastSave() {
        var resumed: String? = null
        compose.setContent {
            SudokuTheme { ContinueGameSheet((1..20).map { save("item-$it") }, {}, { resumed = it }) }
        }
        compose.waitForIdle()
        val partialTop = compose.onNodeWithText("继续存档").fetchSemanticsNode().boundsInRoot.top
        capture("continue-half")

        compose.onNodeWithText("继续存档").performTouchInput {
            swipe(center, Offset(center.x, center.y - partialTop * 0.8f), 400)
        }
        compose.waitForIdle()
        val expandedTop = compose.onNodeWithText("继续存档").fetchSemanticsNode().boundsInRoot.top
        assertTrue("Dragging up must expand the sheet", expandedTop < partialTop * 0.3f)
        capture("continue-full")

        compose.onNodeWithTag("continue-saves").performScrollToNode(hasTestTag("continue-save-item-20"))
        compose.onNodeWithTag("continue-save-item-20").assertIsDisplayed().performClick()
        compose.runOnIdle { assertEquals("item-20", resumed) }
    }

    @Test fun shortSaveListShrinksFromTheDefaultHeightThroughAnIntermediatePosition() {
        val loading = mutableStateOf(true)
        compose.setContent {
            SudokuTheme {
                ContinueGameSheet(if (loading.value) emptyList() else listOf(save("short")), {}, {}, loading.value)
            }
        }
        compose.waitForIdle()
        val initialTop = compose.onNodeWithText("继续存档").fetchSemanticsNode().boundsInRoot.top
        compose.mainClock.autoAdvance = false

        compose.runOnIdle { loading.value = false }
        val positions = mutableListOf<Float>()
        repeat(30) {
            compose.mainClock.advanceTimeBy(32)
            positions += compose.onNodeWithText("继续存档").fetchSemanticsNode().boundsInRoot.top
        }
        val finalTop = positions.last()
        assertTrue("Short results must shrink the sheet", finalTop > initialTop + 20f)
        assertTrue(
            "Shrinking must animate through intermediate heights",
            positions.any {
                it > initialTop + 1f &&
                    it < finalTop - 1f
            }
        )
        compose.onNodeWithTag("continue-save-short").assertIsDisplayed()
        capture("continue-short")
    }

    @Test fun aShortPageWithMoreResultsKeepsTheDefaultHeight() {
        val loading = mutableStateOf(true)
        var moreRequests = 0
        compose.setContent {
            SudokuTheme {
                ContinueGameSheet(
                    if (loading.value) emptyList() else listOf(save("page-one")),
                    {},
                    {},
                    loading = loading.value,
                    hasMore = true,
                    onMore = { moreRequests++ }
                )
            }
        }
        compose.waitForIdle()
        val header = compose.onNodeWithText("继续存档").fetchSemanticsNode().boundsInRoot

        compose.runOnIdle { loading.value = false }
        compose.waitForIdle()
        assertEquals(header, compose.onNodeWithText("继续存档").fetchSemanticsNode().boundsInRoot)
        compose.onNodeWithText("加载更多").assertIsDisplayed().performClick()
        compose.runOnIdle { assertEquals(1, moreRequests) }
    }

    @Test fun loadingSheetMovesContinuouslyPastTheBottomEdge() {
        assertContinuousEntrance(emptyList(), loading = true)
    }

    @Test fun cachedSheetMovesContinuouslyPastTheBottomEdge() {
        assertContinuousEntrance(listOf(save("cached")), loading = false)
    }

    @Test fun cachedShortListOpensDirectlyAtItsContentHeight() {
        assertDirectCompactEntrance(loading = false)
    }

    @Test fun refreshingCachedShortListOpensDirectlyAtItsContentHeight() {
        assertDirectCompactEntrance(loading = true)
    }

    private fun assertDirectCompactEntrance(loading: Boolean) {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            SudokuTheme { ContinueGameSheet(listOf(save("cached")), {}, {}, loading = loading) }
        }
        val positions = List(70) {
            compose.mainClock.advanceTimeBy(16)
            compose.onNodeWithText("继续存档").getUnclippedBoundsInRoot().top.value
        }
        val finalTop = positions.last()

        // Opening cached content must not overshoot to half-screen and then shrink back.
        assertTrue(
            "Cached content must open directly at its final height: $positions",
            positions.min() >= finalTop - 2f
        )
        compose.onNodeWithTag("continue-save-cached").assertIsDisplayed()
        compose.onNodeWithTag("continue-skeleton").assertDoesNotExist()
    }

    private fun assertContinuousEntrance(saves: List<SummaryItem>, loading: Boolean) {
        compose.mainClock.autoAdvance = false
        compose.setContent { SudokuTheme { ContinueGameSheet(saves, {}, {}, loading = loading) } }
        val positions = List(20) {
            compose.mainClock.advanceTimeBy(16)
            compose.onNodeWithText("继续存档").getUnclippedBoundsInRoot().top.value
        }
        // Window insets settle during the first frames. They must not stall the native entrance
        // for the duration of the content-size animation before the title is even on screen.
        assertTrue("The sheet must keep moving between 80 ms and 160 ms: $positions", positions[9] < positions[4] - 8f)
    }

    @Test fun shortResultsShrinkWhileTheSkeletonIsStillFadingOut() {
        val loading = mutableStateOf(true)
        compose.setContent {
            SudokuTheme {
                ContinueGameSheet(if (loading.value) emptyList() else listOf(save("synchronized")), {
                }, {}, loading.value)
            }
        }
        compose.waitForIdle()
        val initialTop = compose.onNodeWithText("继续存档").getUnclippedBoundsInRoot().top.value
        compose.mainClock.autoAdvance = false

        compose.runOnIdle { loading.value = false }
        compose.mainClock.advanceTimeBy(80)
        compose.onNodeWithTag("continue-skeleton").assertExists()
        compose.onNodeWithTag("continue-save-synchronized").assertExists()
        val movingTop = compose.onNodeWithText("继续存档").getUnclippedBoundsInRoot().top.value
        assertTrue("The sheet must already shrink while the skeleton fades", movingTop > initialTop + 1f)
        capture("continue-transition")

        var fadeFinishedTop: Float? = null
        repeat(30) {
            compose.mainClock.advanceTimeBy(16)
            if (fadeFinishedTop == null &&
                compose.onAllNodesWithTag("continue-skeleton").fetchSemanticsNodes().isEmpty()
            ) {
                fadeFinishedTop = compose.onNodeWithText("继续存档").getUnclippedBoundsInRoot().top.value
            }
        }
        val finalTop = compose.onNodeWithText("继续存档").getUnclippedBoundsInRoot().top.value
        assertEquals("Resizing must finish with the content fade", finalTop, checkNotNull(fadeFinishedTop), 2f)
    }

    private fun capture(name: String) {
        if (InstrumentationRegistry.getArguments().getString("captureSheets") != "true") return
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val screenshot = instrumentation.uiAutomation.takeScreenshot()
        File(instrumentation.targetContext.getExternalFilesDir(null), "$name.png").outputStream().use {
            screenshot.compress(Bitmap.CompressFormat.PNG, 100, it)
        }
        screenshot.recycle()
    }

    private fun save(id: String) = SummaryItem(
        id,
        GameSummary(
            id, 1, Variant.CLASSIC, Difficulty.EASY, SessionMetadata.Free,
            "2026-10-17T00:00:00.000Z", 62000, null, false, 4, 45
        )
    )
}
