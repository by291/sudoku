package dev.yigeyinian.sudoku

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.pressBack
import dagger.hilt.android.testing.BindValue
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import dagger.hilt.android.testing.UninstallModules
import dev.yigeyinian.sudoku.engine.RustSudokuEngine
import dev.yigeyinian.sudoku.model.Difficulty
import dev.yigeyinian.sudoku.model.EngineOutcome
import dev.yigeyinian.sudoku.model.GameRepository
import dev.yigeyinian.sudoku.model.PreparedPuzzle
import dev.yigeyinian.sudoku.model.Puzzle
import dev.yigeyinian.sudoku.model.PuzzleRules
import dev.yigeyinian.sudoku.model.SessionMetadata
import dev.yigeyinian.sudoku.model.StorageOutcome
import dev.yigeyinian.sudoku.model.SudokuEngine
import dev.yigeyinian.sudoku.model.createSession
import dev.yigeyinian.sudoku.runtime.EngineModule
import javax.inject.Inject
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test

/** Uses the packaged ARM library and Room through the same application composition as the player. */
@HiltAndroidTest
@UninstallModules(EngineModule::class)
class PlayerWorkflowTest {
    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val compose = createEmptyComposeRule()

    private val controlledEngine = ConflictGateEngine()

    @BindValue @JvmField
    val engine: SudokuEngine = controlledEngine

    @Inject lateinit var repository: GameRepository
    private var activity: ActivityScenario<MainActivity>? = null

    @Before
    fun seedPausedGame() {
        hiltRule.inject()
        runBlocking {
            val epoch = (repository.readDatasetEpoch() as StorageOutcome.Success).value
            assertTrue(repository.clearAll(epoch) is StorageOutcome.Success)
            val solution = List(81) { cell -> ((cell / 9) * 3 + (cell / 9) / 3 + cell % 9) % 9 + 1 }
            // Eighty givens leave exactly the known first digit; no solver creates this oracle.
            val puzzle = Puzzle(
                solution.mapIndexed { cell, value ->
                    if (cell ==
                        0
                    ) {
                        0
                    } else {
                        value
                    }
                },
                solution,
                PuzzleRules.Classic,
                Difficulty.EASY,
                "00".repeat(32),
                "sudoku-v11"
            )
            val session = createSession(puzzle, SessionMetadata.Free, "player-workflow", "2026-10-16T00:00:00.000Z")
            val token = (repository.claimEditor(session.id, "instrumentation-fixture") as StorageOutcome.Success).value
            assertTrue(repository.writeSession(session, 0, token) is StorageOutcome.Success)
            assertTrue(repository.releaseEditor(token) is StorageOutcome.Success)
        }
        activity = ActivityScenario.launch(MainActivity::class.java)
        awaitText("继续上次")
    }

    @After
    fun closeActivity() {
        activity?.close()
    }

    @Test
    fun restoresPausedAndCompletesThroughTheNativeEntryAction() {
        compose.onNodeWithText("继续上次").performClick()
        awaitText("对局已暂停")
        compose.onNodeWithTag("cell-0").assertDoesNotExist()

        compose.onNodeWithText("继续对局").performClick()
        compose.onNodeWithTag("cell-0").performClick()
        compose.onNodeWithContentDescription("填入数字1").performClick()
        awaitText("完成了！")

        runBlocking {
            val results = (repository.listResults() as StorageOutcome.Success).value
            assertEquals(1, results.size)
            assertEquals(1, results.single().session.entries[0])
            assertEquals(false, results.single().session.assistance.assisted)
        }
    }

    @Test
    fun pausesAndObscuresTheBoardWithoutRemovingItsSave() {
        compose.onNodeWithText("继续上次").performClick()
        awaitText("继续对局")
        compose.onNodeWithText("继续对局").performClick()
        compose.onNodeWithTag("cell-0").performClick()
        compose.onNodeWithContentDescription("暂停", useUnmergedTree = true).performClick()
        awaitText("对局已暂停")

        compose.onNodeWithTag("cell-0").assertDoesNotExist()
        runBlocking {
            val sessions = (repository.listSessions() as StorageOutcome.Success).value
            assertEquals("player-workflow", sessions.single().session.id)
        }
    }

    @Test
    fun keepsTheEntireBoardWithinTheInitialGameViewport() {
        compose.onNodeWithText("继续上次").performClick()
        awaitText("继续对局")
        compose.onNodeWithText("继续对局").performClick()

        val firstCell = compose.onNodeWithTag("cell-0").fetchSemanticsNode().boundsInRoot
        val lastCell = compose.onNodeWithTag("cell-80").fetchSemanticsNode().boundsInRoot
        // Clipped bounds must retain a complete cell even in the side-by-side landscape layout.
        assertTrue("The last row must be fully visible", lastCell.height >= firstCell.height - 1f)
        compose.onNodeWithContentDescription("查看规则").assertDoesNotExist()
        compose.onNodeWithContentDescription("放大检查棋盘").assertDoesNotExist()
        compose.onNodeWithContentDescription("更多").performScrollTo().performClick()
        compose.onNodeWithText("放大检查棋盘").performClick()
        compose.onNodeWithText("检查棋盘").assertIsDisplayed()
    }

    @Test
    fun keepsBoardAndKeysStationaryWhileCheckingAnIncorrectEntry() {
        compose.onNodeWithText("继续上次").performClick()
        awaitText("继续对局")
        compose.onNodeWithText("继续对局").performClick()
        compose.onNodeWithTag("cell-0").performClick()
        compose.waitUntil(20_000) {
            compose.onAllNodesWithText("正在检查当前棋盘规则…").fetchSemanticsNodes().isEmpty()
        }
        val boardBefore = compose.onNodeWithTag("cell-0").fetchSemanticsNode().boundsInRoot
        val keyBefore = compose.onNodeWithContentDescription("填入数字2").fetchSemanticsNode().boundsInRoot
        val gate = CompletableDeferred<Unit>()
        controlledEngine.conflictGate = gate

        try {
            // The first cell is 1; entering 2 duplicates the fixed second cell.
            compose.onNodeWithContentDescription("填入数字2").performClick()
            awaitText("正在检查当前棋盘规则…")

            assertEquals(boardBefore, compose.onNodeWithTag("cell-0").fetchSemanticsNode().boundsInRoot)
            assertEquals(keyBefore, compose.onNodeWithContentDescription("填入数字2").fetchSemanticsNode().boundsInRoot)
        } finally {
            gate.complete(Unit)
            controlledEngine.conflictGate = null
        }
        awaitDescription("冲突", substring = true)
        assertEquals(boardBefore, compose.onNodeWithTag("cell-0").fetchSemanticsNode().boundsInRoot)
        assertEquals(keyBefore, compose.onNodeWithContentDescription("填入数字2").fetchSemanticsNode().boundsInRoot)

        compose.onNodeWithContentDescription("擦除").performClick()
        awaitDescription("第1行第1列，空格", substring = true)
        assertEquals(boardBefore, compose.onNodeWithTag("cell-0").fetchSemanticsNode().boundsInRoot)
    }

    @Test
    fun keepsGameToolsAndAllDigitsVisibleOnPhone() {
        compose.onNodeWithText("继续上次").performClick()
        awaitText("继续对局")
        compose.onNodeWithText("继续对局").performClick()
        compose.onNodeWithTag("cell-0").performClick()
        val viewport = compose.onRoot().getUnclippedBoundsInRoot()

        val controls = listOf("撤销", "重做", "擦除", "笔记", "提示", "更多") + (1..9).map { "填入数字$it" }
        controls.forEach { label ->
            val control = compose.onNodeWithContentDescription(label)
            control.assertIsDisplayed()
            val bounds = control.getUnclippedBoundsInRoot()
            assertTrue(
                "$label must fit without scrolling",
                bounds.top >= viewport.top && bounds.bottom <= viewport.bottom
            )
        }
        val firstDigit = compose.onNodeWithContentDescription("填入数字1").getUnclippedBoundsInRoot()
        val lastDigit = compose.onNodeWithContentDescription("填入数字9").getUnclippedBoundsInRoot()
        assertEquals("All digits should share one row when they fit", firstDigit.top, lastDigit.top)
        compose.onNodeWithText("填写数字").assertDoesNotExist()
        compose.onNodeWithText("进度已保存到本机").assertDoesNotExist()
    }

    @Test
    fun switchesNotesAndPreservesUndoRedoAndEraseActions() {
        compose.onNodeWithText("继续上次").performClick()
        awaitText("继续对局")
        compose.onNodeWithText("继续对局").performClick()
        compose.onNodeWithTag("cell-0").performClick()
        compose.onNodeWithContentDescription("笔记").performScrollTo().performClick()
        compose.onNodeWithContentDescription("笔记").assertIsSelected()
        compose.onNodeWithContentDescription("笔记数字2").performScrollTo().performClick()
        awaitDescription("第1行第1列，空格，笔记2")

        compose.onNodeWithContentDescription("撤销").performScrollTo().performClick()
        awaitDescription("第1行第1列，空格")
        compose.onNodeWithContentDescription("重做").performScrollTo().performClick()
        awaitDescription("第1行第1列，空格，笔记2")
        compose.onNodeWithContentDescription("笔记").performClick()
        compose.onNodeWithContentDescription("笔记").assertIsNotSelected()
        compose.onNodeWithContentDescription("填入数字2").performScrollTo().performClick()
        awaitDescription("第1行第1列，数字2", substring = true)
        compose.onNodeWithContentDescription("擦除").performScrollTo().performClick()
        awaitDescription("第1行第1列，空格")
    }

    @Test
    fun entersQuickNotesWithoutChangingTheMainInputMode() {
        compose.onNodeWithText("继续上次").performClick()
        awaitText("继续对局")
        compose.onNodeWithText("继续对局").performClick()
        compose.onNodeWithTag("cell-0").performClick()

        compose.onNodeWithContentDescription("快捷笔记数字2").performScrollTo().performClick()
        awaitDescription("第1行第1列，空格，笔记2")
        compose.onNodeWithContentDescription("快捷笔记数字2").assertIsSelected()
        compose.onNodeWithContentDescription("笔记").assertIsNotSelected()
        compose.onNodeWithContentDescription("填入数字2").assertExists()

        compose.onNodeWithContentDescription("快捷笔记数字2").performClick()
        awaitDescription("第1行第1列，空格")
        compose.onNodeWithContentDescription("快捷笔记数字3").performClick()
        awaitDescription("第1行第1列，空格，笔记3")
        compose.onNodeWithContentDescription("撤销").performScrollTo().performClick()
        awaitDescription("第1行第1列，空格")

        compose.onNodeWithTag("cell-1").performScrollTo().performClick()
        compose.onNodeWithContentDescription("快捷笔记数字2").assertIsNotEnabled()
    }

    @Test
    fun opensAndCancelsSetupWithoutReplacingAnExistingSave() {
        compose.onNodeWithText("开始数独").performClick()
        awaitText("继续存档")
        compose.onNodeWithText("继续存档").performScrollTo().assertIsDisplayed()
        compose.onNodeWithContentDescription("关闭选择面板").performClick()
        compose.onNodeWithText("继续上次").assertIsDisplayed()

        runBlocking {
            assertEquals(
                "player-workflow",
                (repository.listSessions() as StorageOutcome.Success).value.single().session.id
            )
        }
    }

    @Test
    fun keepsSetupChoicesAndActionsVisibleOnPhone() {
        compose.onNodeWithText("开始数独").performClick()
        awaitText("继续存档")

        listOf("标准数独", "对角数独", "不规则数独", "杀手数独", "温度计数独", "箭头数独")
            .forEach { compose.onNodeWithContentDescription(it).assertIsDisplayed() }
        listOf("简单", "中等", "困难", "专家", "继续存档", "开始新局")
            .forEach { compose.onNodeWithText(it).assertIsDisplayed() }
    }

    @Test
    fun changesSetupSelectionWithoutStartingOrReplacingTheSave() {
        compose.onNodeWithText("开始数独").performClick()
        awaitText("选择难度")
        compose.onNodeWithText("专家").performScrollTo().performClick()
        compose.onNodeWithContentDescription("对角数独").performScrollTo().performClick()

        compose.onNodeWithContentDescription("对角数独").assertIsSelected()
        compose.onNodeWithText("专家").assertDoesNotExist()
        compose.onNodeWithText("简单").performScrollTo().assertIsSelected()
        compose.onNodeWithText("继续存档").assertDoesNotExist()
        compose.onNodeWithText("开始游戏").assertIsDisplayed()
        pressBack()
        awaitText("开始数独")

        runBlocking {
            assertEquals(
                "player-workflow",
                (repository.listSessions() as StorageOutcome.Success).value.single().session.id
            )
        }
    }

    @Test
    fun dismissesDailySelectionBackToHome() {
        compose.onNodeWithText("每日挑战").performScrollTo().performClick()
        awaitText("开始今日挑战")
        compose.onNodeWithContentDescription("箭头数独").performScrollTo().performClick()
        compose.onNodeWithContentDescription("箭头数独").assertIsSelected()
        compose.onNodeWithText("选择难度").assertDoesNotExist()
        compose.onNodeWithText("开始今日挑战").assertIsDisplayed()
        pressBack()
        compose.onNodeWithText("开始今日挑战").assertDoesNotExist()
        compose.onNodeWithText("开始数独").assertIsDisplayed()

        runBlocking {
            assertEquals(
                "player-workflow",
                (repository.listSessions() as StorageOutcome.Success).value.single().session.id
            )
        }
    }

    @Test
    fun retainsTheRecordsFilterWhenReturningThroughHome() {
        compose.onNodeWithText("我的记录").performScrollTo().performClick()
        awaitText("杀手数独")
        compose.onNodeWithText("杀手数独").performScrollTo().performClick()
        compose.onNodeWithContentDescription("返回首页").performClick()
        awaitText("开始数独")

        compose.onNodeWithText("我的记录").performScrollTo().performClick()
        awaitText("杀手数独")
        compose.onNodeWithText("杀手数独").assertIsSelected()
    }

    @Test
    fun showsAllHomeEntriesAndContinueWithinTheInitialViewport() {
        val viewport = compose.onRoot().getUnclippedBoundsInRoot()

        listOf("开始数独", "继续上次", "每日挑战", "学习数独", "我的记录").forEach { label ->
            val entry = compose.onNodeWithText(label)
            entry.assertIsDisplayed()

            val bounds = entry.getUnclippedBoundsInRoot()
            assertTrue(
                "$label must be fully visible without scrolling",
                bounds.top >= viewport.top && bounds.bottom <= viewport.bottom
            )
        }
    }

    @Test
    fun opensEveryWorkflowFromHomeAndReturnsWithoutTabNavigation() {
        compose.onNodeWithText("首页", useUnmergedTree = true).assertDoesNotExist()
        compose.onNodeWithText("学习", useUnmergedTree = true).assertDoesNotExist()
        compose.onNodeWithText("每日", useUnmergedTree = true).assertDoesNotExist()
        compose.onNodeWithText("记录", useUnmergedTree = true).assertDoesNotExist()

        compose.onNodeWithText("每日挑战").performScrollTo().performClick()
        awaitText("开始今日挑战")
        pressBack()
        awaitText("开始数独")

        compose.onNodeWithText("学习数独").performScrollTo().performClick()
        awaitText("每一步，都有理由。")
        pressBack()
        awaitText("开始数独")

        compose.onNodeWithText("我的记录").performScrollTo().performClick()
        awaitText("杀手数独")
        pressBack()
        awaitText("开始数独")
        compose.onNodeWithContentDescription("返回首页").assertDoesNotExist()
    }

    private fun awaitDescription(description: String, substring: Boolean = false) {
        compose.waitUntil(20_000) {
            compose.onAllNodes(
                hasContentDescription(description, substring = substring)
            ).fetchSemanticsNodes().isNotEmpty()
        }
    }

    private fun awaitText(text: String) {
        compose.waitUntil(20_000) { compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() }
    }
}

/** Holds only conflict delivery so the real pending UI can be measured deterministically. */
private class ConflictGateEngine(private val native: SudokuEngine = RustSudokuEngine()) : SudokuEngine by native {
    @Volatile var conflictGate: CompletableDeferred<Unit>? = null

    override suspend fun prepare(rules: PuzzleRules): EngineOutcome<PreparedPuzzle> =
        when (val result = native.prepare(rules)) {
            is EngineOutcome.Completed -> EngineOutcome.Completed(
                object : PreparedPuzzle by result.value {
                    override suspend fun conflicts(board: List<Int>) = run {
                        conflictGate?.await()
                        result.value.conflicts(board)
                    }
                },
                result.workUsed
            )
            else -> result
        }
}
