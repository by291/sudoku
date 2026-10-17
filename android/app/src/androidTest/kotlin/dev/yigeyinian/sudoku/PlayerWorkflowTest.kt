package dev.yigeyinian.sudoku

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.getUnclippedBoundsInRoot
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
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import dev.yigeyinian.sudoku.model.Difficulty
import dev.yigeyinian.sudoku.model.GameRepository
import dev.yigeyinian.sudoku.model.Puzzle
import dev.yigeyinian.sudoku.model.PuzzleRules
import dev.yigeyinian.sudoku.model.SessionMetadata
import dev.yigeyinian.sudoku.model.StorageOutcome
import dev.yigeyinian.sudoku.model.createSession
import javax.inject.Inject
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test

/** Uses the packaged ARM library and Room through the same application composition as the player. */
@HiltAndroidTest
class PlayerWorkflowTest {
    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val compose = createEmptyComposeRule()

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
        compose.onNodeWithContentDescription("放大检查棋盘").assertIsDisplayed()
    }

    @Test
    fun opensAndCancelsSetupWithoutReplacingAnExistingSave() {
        compose.onNodeWithText("开始数独").performClick()
        awaitText("继续存档")
        compose.onNodeWithText("取消").performClick()
        compose.onNodeWithText("继续上次").assertIsDisplayed()

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
        awaitText("进入所选挑战")
        compose.onNodeWithContentDescription("返回首页").performClick()
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

    private fun awaitText(text: String) {
        compose.waitUntil(20_000) { compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() }
    }
}
