package dev.sudoku.app.feature.records

import android.graphics.Bitmap
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Surface
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.InputMode
import androidx.compose.ui.input.InputModeManager
import androidx.compose.ui.platform.LocalInputModeManager
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isSelectable
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.test.performScrollToNode
import androidx.test.platform.app.InstrumentationRegistry
import dev.sudoku.app.designsystem.SudokuTheme
import dev.sudoku.app.model.Assistance
import dev.sudoku.app.model.BackupPreview
import dev.sudoku.app.model.Completion
import dev.sudoku.app.model.Difficulty
import dev.sudoku.app.model.GameMode
import dev.sudoku.app.model.GameSession
import dev.sudoku.app.model.LocalBackup
import dev.sudoku.app.model.Puzzle
import dev.sudoku.app.model.PuzzleRules
import dev.sudoku.app.model.ResultRecord
import dev.sudoku.app.model.SessionMetadata
import dev.sudoku.app.model.SessionRecord
import dev.sudoku.app.model.Settings
import dev.sudoku.app.model.Variant
import dev.sudoku.app.model.variant
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class RecordsScreenTest {
    @Test fun queryRetryRemainsAvailableWhileExportAwaitsItsProvider() {
        show(RecordsUiState(loading = false, busy = true, queryFailure = RecordsFailure("读取记录失败")))

        compose.onNodeWithText("重试").performScrollTo().assertIsEnabled().performClick()

        compose.runOnIdle { assertEquals(1, retries) }
    }

    @Test fun backupRetryRemainsAvailableWhileTheSelectedQueryLoads() {
        show(RecordsUiState(loading = true, backupFailure = RecordsFailure("备份解析失败")), backup = true)

        compose.onNodeWithText("重试").performScrollTo().assertIsEnabled().performClick()

        compose.runOnIdle { assertEquals(1, backupRetries) }
    }

    @Test fun closedBackupFailureUsesItsOwnRetryWhileTheQueryLoads() {
        show(RecordsUiState(loading = true, backupFailure = RecordsFailure("导出备份失败")))

        compose.onNodeWithText("导出备份失败").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("重试").performScrollTo().assertIsEnabled().performClick()

        compose.runOnIdle {
            assertEquals(1, backupRetries)
            assertEquals(0, retries)
        }
    }

    @Test fun confirmedClearFailureRemainsRecoverableAfterItsSheetCloses() {
        val state = show(RecordsUiState(loading = false, epoch = 1), backup = true)
        compose.onNodeWithText("清空本机数据").performScrollTo().performClick()
        compose.onNodeWithText("确认清空").assertIsDisplayed().performClick()
        compose.runOnIdle {
            assertTrue(cleared)
            state.value = state.value.copy(loading = true, backupFailure = RecordsFailure("清空数据失败"))
        }

        compose.onNodeWithText("确认清空").assertDoesNotExist()
        compose.onNodeWithText("导出备份").assertDoesNotExist()
        compose.onNodeWithText("清空数据失败").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("重试").performScrollTo().assertIsEnabled().performClick()

        compose.runOnIdle {
            assertEquals(1, backupRetries)
            assertEquals(0, retries)
        }
    }

    @get:Rule val compose = createComposeRule()
    private lateinit var inputMode: InputModeManager
    private var resumed: String? = null
    private var cleared = false
    private var restored = false
    private var exports = 0
    private var imports = 0
    private var cleaned = false
    private var retries = 0
    private var backupRetries = 0

    private fun show(
        initial: RecordsUiState =
            RecordsUiState(
                loading = false,
                epoch = 1,
                summary = dev.sudoku.app.model.summarizeRecords(emptyList(), "2026-10-17")
            ),
        historyItems: List<dev.sudoku.app.model.SummaryItem> = emptyList(),
        backup: Boolean = false
    ): MutableState<RecordsUiState> {
        val state = mutableStateOf(initial)
        val backupOpen = mutableStateOf(backup)
        compose.setContent {
            inputMode = LocalInputModeManager.current
            SudokuTheme {
                Surface(color = androidx.compose.material3.MaterialTheme.colorScheme.background) {
                    Column(Modifier.fillMaxSize().safeDrawingPadding()) {
                        RecordsScreen(
                            state.value,
                            onVariant = { variant ->
                                state.value = state.value.copy(
                                    variant = variant,
                                    items = (if (state.value.tab == RecordsTab.HISTORY) historyItems else initial.items)
                                        .filter { it.summary?.variant == variant }
                                )
                            },
                            onTab = { tab ->
                                state.value = state.value.copy(
                                    tab = tab,
                                    items = (if (tab == RecordsTab.HISTORY) historyItems else initial.items)
                                        .filter { it.summary?.variant == state.value.variant }
                                        .sortedByDescending { it.summary?.startedAt }
                                )
                            },
                            onResume = { resumed = it },
                            onRetry = { retries++ },
                            onRetryBackup = { backupRetries++ },
                            onExport = { exports++ },
                            onImport = { imports++ },
                            onDismissPreview = { state.value = state.value.copy(preview = null) },
                            onRestore = { restored = true },
                            onClear = { cleared = true },
                            onCleanup = { cleaned = true },
                            backupOpen = backupOpen.value,
                            onDismissBackup = { backupOpen.value = false }
                        )
                    }
                }
            }
        }
        return state
    }

    @Test fun overviewKeepsItsCardsWhileCountsAreUnknown() {
        val state = show(RecordsUiState())
        compose.onNodeWithText("每日挑战 · 当前连续").assertIsDisplayed()
        compose.onNodeWithText("0 局").assertDoesNotExist()
        capture("records-loading")
        val card = compose.onNodeWithTag("records-streak").fetchSemanticsNode().boundsInRoot
        val bests = compose.onNodeWithTag("records-bests").fetchSemanticsNode().boundsInRoot

        compose.runOnIdle {
            state.value = state.value.copy(
                loading = false,
                epoch = 1,
                summary = dev.sudoku.app.model.summarizeRecords(emptyList(), "2026-10-17")
            )
        }

        capture("records-loaded")
        assertEquals(card, compose.onNodeWithTag("records-streak").fetchSemanticsNode().boundsInRoot)
        assertEquals(bests, compose.onNodeWithTag("records-bests").fetchSemanticsNode().boundsInRoot)
    }

    @Test fun unreadListsShowPlaceholdersInsteadOfFalseEmptyStates() {
        show(RecordsUiState())
        tabNode("本地存档").performClick()
        compose.onNodeWithTag("records-list-placeholder").assertIsDisplayed()
        compose.onNodeWithText("还没有存档").assertDoesNotExist()
        tabNode("完成历史").performClick()
        compose.onNodeWithTag("records-list-placeholder").assertIsDisplayed()
        compose.onNodeWithText("第一份记录，等你写下").assertDoesNotExist()
    }

    @Test fun recordTabsSeparateOverviewFromEmptyLists() {
        show()
        tabNode("概览").assertIsSelected()
        tabNode("本地存档").performClick()
        pageNode("还没有存档").assertIsDisplayed()
        capture("empty-saves")
        tabNode("完成历史").performClick()
        pageNode("第一份记录，等你写下").assertIsDisplayed()
        tabNode("概览").performClick()
        pageNode("最佳用时").assertIsDisplayed()
    }

    @Test fun clearRequiresAnExplicitConfirmationAndCancelIsInitiallyFocused() {
        show(backup = true)
        compose.runOnIdle { inputMode.requestInputMode(InputMode.Keyboard) }
        compose.onNodeWithText("清空本机数据").performScrollTo().performClick()
        compose.onNodeWithText("确认清空").assertIsDisplayed()
        compose.onNodeWithText("取消").assertIsFocused().performClick()
        compose.runOnIdle { assertFalse(cleared) }

        compose.onNodeWithText("清空本机数据").performScrollTo().performClick()
        compose.onNodeWithText("确认清空").performClick()
        compose.runOnIdle { assertTrue(cleared) }
    }

    @Test fun backupPreviewShowsCountsBeforeDestructiveReplacement() {
        val backup = LocalBackup(
            exportedAt = "2026-10-16T01:02:03.004Z",
            sessions = emptyList(),
            results = emptyList(),
            lessons = emptyList(),
            settings = Settings()
        )
        show(RecordsUiState(loading = false, epoch = 1, preview = BackupPreview(backup, 1)))

        compose.onNodeWithText("导出时间：2026-10-16T01:02:03.004Z", substring = true).assertIsDisplayed()
        compose.runOnIdle { assertFalse(restored) }
        compose.onNodeWithText("确认替换本机数据").performClick()
        compose.runOnIdle { assertTrue(restored) }
    }

    @Test fun savesAndHistoryOpenTheSelectedSessionAndKeepTheVariantFilter() {
        val first = session("older", Difficulty.EASY, "2026-10-15T08:00:00Z")
        val latest = session("latest", Difficulty.HARD, "2026-10-17T08:00:00Z")
        val diagonal = session("diagonal", Difficulty.MEDIUM, "2026-10-16T08:00:00Z", PuzzleRules.Diagonal)
        val completed = first.copy(completion = Completion("2026-10-15T08:04:32Z", 272000))
        show(
            RecordsUiState(
                loading = false,
                epoch = 1,
                items = listOf(first, diagonal, latest).map { it.summaryItem() },
                summary = dev.sudoku.app.model.summarizeRecords(
                    listOf(ResultRecord(session = completed)),
                    "2026-10-17"
                )
            ),
            historyItems = listOf(completed.summaryItem())
        )
        capture("overview")

        tabNode("本地存档").performClick()
        capture("saves")
        pageNode("自由游玩 · 困难").assertIsDisplayed()
        pageNode("自由游玩 · 简单").performClick()
        compose.runOnIdle { assertEquals("older", resumed) }
        tabNode("完成历史").performClick()
        pageNode("查看记录", substring = true).performClick()
        compose.runOnIdle { assertEquals("older", resumed) }
        capture("history")

        compose.onNodeWithTag("records-content").performScrollToIndex(0)
        compose.onNodeWithContentDescription("对角数独").performScrollTo().performClick()
        tabNode("完成历史").assertIsSelected()
        pageNode("第一份记录，等你写下").assertIsDisplayed()
        tabNode("本地存档").performClick()
        pageNode("继续对局").performClick()
        compose.runOnIdle { assertEquals("diagonal", resumed) }
    }

    @Test fun backupActionsAreDisabledWhileBusyAndFailuresStayInTheSheet() {
        val state = show(RecordsUiState(loading = false, epoch = 1, busy = true), backup = true)
        compose.onNodeWithText("导出备份").performScrollTo().assertIsNotEnabled()
        compose.onNodeWithText("从备份恢复").performScrollTo().assertIsNotEnabled()
        compose.runOnIdle {
            state.value = state.value.copy(busy = false, backupFailure = RecordsFailure("写入备份失败"))
        }

        compose.onNodeWithText("写入备份失败").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("重试").performScrollTo().performClick()
        compose.onNodeWithText("导出备份").performScrollTo().performClick()
        compose.onNodeWithText("从备份恢复").performScrollTo().performClick()
        compose.runOnIdle {
            assertEquals(1, exports)
            assertEquals(1, imports)
            assertEquals(1, backupRetries)
        }
        capture("backup")
    }

    @Test fun quarantineCleanupStillRequiresConfirmation() {
        show(RecordsUiState(loading = false, epoch = 1, quarantined = 2), backup = true)
        compose.onNodeWithText("清理隔离记录").performScrollTo().performClick()
        compose.onNodeWithText("确认清理").assertIsDisplayed()
        compose.runOnIdle { assertFalse(cleaned) }
        compose.onNodeWithText("确认清理").performClick()
        compose.runOnIdle { assertTrue(cleaned) }
    }

    @Test fun firstLoadShowsUnknownStatisticsAndRefreshRetainsLoadedData() {
        val state = show(RecordsUiState())
        compose.onNodeWithText("0 局").assertDoesNotExist()
        pageNode("最佳用时").assertIsDisplayed()
        compose.runOnIdle {
            state.value = state.value.copy(
                loading = false,
                epoch = 1,
                summary = dev.sudoku.app.model.summarizeRecords(emptyList(), "2026-10-17")
            )
        }
        pageNode("最佳用时").assertIsDisplayed()
        compose.runOnIdle { state.value = state.value.copy(loading = true) }
        compose.onNodeWithText("最佳用时").assertIsDisplayed()
    }

    private fun tabNode(label: String): SemanticsNodeInteraction {
        val matcher = hasText(label) and isSelectable()
        compose.onNodeWithTag("records-content").performScrollToNode(matcher)
        return compose.onNode(matcher)
    }

    private fun pageNode(text: String, substring: Boolean = false): SemanticsNodeInteraction {
        compose.onNodeWithTag("records-content").performScrollToNode(hasText(text, substring = substring))
        return compose.onNodeWithText(text, substring = substring)
    }

    private fun capture(name: String) {
        if (InstrumentationRegistry.getArguments().getString("captureRecords") != "true") return
        compose.waitForIdle()
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val bitmap = checkNotNull(instrumentation.uiAutomation.takeScreenshot())
        try {
            File(instrumentation.targetContext.getExternalFilesDir(null), "$name.png").outputStream().use {
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)
            }
        } finally {
            bitmap.recycle()
        }
    }
}

private fun session(
    id: String,
    difficulty: Difficulty,
    startedAt: String,
    rules: PuzzleRules = PuzzleRules.Classic
): GameSession = GameSession(
    id = id,
    puzzle = Puzzle(
        List(81) { 0 },
        List(81) { (it / 9 * 3 + it / 27 + it % 9) % 9 + 1 },
        rules,
        difficulty,
        "00".repeat(32),
        "v11"
    ),
    mode = GameMode.FREE,
    startedAt = startedAt,
    metadata = SessionMetadata.Free,
    elapsedMs = 272000,
    assistance = Assistance()
)

private fun GameSession.summaryItem(): dev.sudoku.app.model.SummaryItem {
    val summary = dev.sudoku.app.model.GameSummary(
        id, 1, puzzle.rules.variant, puzzle.difficulty, metadata,
        startedAt, elapsedMs, completion, assistance.assisted, 0, puzzle.givens.count { it == 0 }
    )
    return dev.sudoku.app.model.SummaryItem(id, summary)
}
