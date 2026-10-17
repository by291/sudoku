package dev.yigeyinian.sudoku

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ActivityScenario
import dagger.hilt.android.testing.BindValue
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import dagger.hilt.android.testing.UninstallModules
import dev.yigeyinian.sudoku.engine.RustSudokuEngine
import dev.yigeyinian.sudoku.model.Difficulty
import dev.yigeyinian.sudoku.model.GameRepository
import dev.yigeyinian.sudoku.model.Puzzle
import dev.yigeyinian.sudoku.model.PuzzleContent
import dev.yigeyinian.sudoku.model.PuzzleRules
import dev.yigeyinian.sudoku.model.SessionMetadata
import dev.yigeyinian.sudoku.model.StorageOutcome
import dev.yigeyinian.sudoku.model.SudokuEngine
import dev.yigeyinian.sudoku.model.Variant
import dev.yigeyinian.sudoku.model.challengeDate
import dev.yigeyinian.sudoku.model.createSession
import dev.yigeyinian.sudoku.model.dailyFormalId
import dev.yigeyinian.sudoku.runtime.EngineModule
import java.time.Instant
import java.util.concurrent.atomic.AtomicInteger
import javax.inject.Inject
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@HiltAndroidTest
@UninstallModules(EngineModule::class)
class StartupProgressTest {
    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val compose = createEmptyComposeRule()

    private val readiness = CompletableDeferred<Unit>()
    private val native = RustSudokuEngine()

    @Inject lateinit var repository: GameRepository

    @Volatile private var savedReadGate: CompletableDeferred<Unit>? = null
    private val savedReadCount = AtomicInteger()

    @BindValue @JvmField
    val engine: SudokuEngine = object : SudokuEngine by native {
        override suspend fun information() = run {
            readiness.await()
            native.information()
        }

        override suspend fun validatePuzzle(content: PuzzleContent) = run {
            savedReadCount.incrementAndGet()
            savedReadGate?.await()
            native.validatePuzzle(content)
        }
    }

    @Test
    fun preparesFreeAndDailySavesBeforeShowingHomeWithoutReadingTwice() {
        hiltRule.inject()
        val today = challengeDate(Instant.now())
        runBlocking {
            val epoch = (repository.readDatasetEpoch() as StorageOutcome.Success).value
            assertTrue(repository.clearAll(epoch) is StorageOutcome.Success)
            val solution = List(81) { ((it / 9) * 3 + (it / 9) / 3 + it % 9) % 9 + 1 }
            val puzzle = Puzzle(
                solution.mapIndexed { cell, digit -> if (cell == 0) 0 else digit },
                solution,
                PuzzleRules.Classic,
                Difficulty.EASY,
                "00".repeat(32),
                "sudoku-v11"
            )
            val sessions = listOf(
                createSession(puzzle, SessionMetadata.Free, "startup-free", "2026-10-16T00:00:00.000Z"),
                createSession(
                    puzzle,
                    SessionMetadata.Daily(today, true),
                    dailyFormalId(today, Variant.CLASSIC),
                    "2026-10-16T00:00:00.000Z"
                )
            )
            sessions.forEach { session ->
                val token = (repository.claimEditor(session.id, "startup-fixture") as StorageOutcome.Success).value
                assertTrue(repository.writeSession(session, 0, token) is StorageOutcome.Success)
                assertTrue(repository.releaseEditor(token) is StorageOutcome.Success)
            }
        }
        savedReadCount.set(0)
        val gate = CompletableDeferred<Unit>()
        savedReadGate = gate
        readiness.complete(Unit)
        val activity = ActivityScenario.launch(MainActivity::class.java)
        try {
            compose.waitUntil(20_000) { savedReadCount.get() > 0 }
            compose.onNodeWithText("开始数独").assertDoesNotExist()
            compose.onNodeWithText("继续上次").assertDoesNotExist()

            gate.complete(Unit)
            savedReadGate = null
            compose.waitUntil(20_000) {
                compose.onAllNodesWithText("继续上次").fetchSemanticsNodes().isNotEmpty()
            }
            compose.onNodeWithText("开始数独").assertIsEnabled()
            compose.onNodeWithText("继续上次").assertIsEnabled()
            assertEquals(2, savedReadCount.get())

            compose.onNodeWithText("每日挑战").performClick()
            compose.waitUntil(20_000) {
                compose.onAllNodesWithText("继续今日挑战").fetchSemanticsNodes().isNotEmpty()
            }
            compose.onNodeWithText("继续今日挑战").assertIsEnabled()
            assertEquals(2, savedReadCount.get())
        } finally {
            gate.complete(Unit)
            savedReadGate = null
            activity.close()
        }
    }

    @Test
    fun delaysStartupFeedbackWithoutDelayingReadiness() {
        hiltRule.inject()
        compose.mainClock.autoAdvance = false
        val activity = ActivityScenario.launch(MainActivity::class.java)
        try {
            compose.mainClock.advanceTimeBy(100)
            compose.onNodeWithText("正在准备首页…").assertDoesNotExist()
            compose.mainClock.advanceTimeBy(500)
            compose.onNodeWithText("正在准备首页…").assertIsDisplayed()

            readiness.complete(Unit)
            compose.mainClock.autoAdvance = true
            compose.waitUntil(20_000) {
                compose.onAllNodesWithText("开始数独").fetchSemanticsNodes().isNotEmpty()
            }

            compose.onNodeWithText("正在准备首页…").assertDoesNotExist()
        } finally {
            readiness.complete(Unit)
            compose.mainClock.autoAdvance = true
            activity.close()
        }
    }
}
