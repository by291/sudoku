package dev.sudoku.app

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
import dev.sudoku.app.engine.RustSudokuEngine
import dev.sudoku.app.model.Difficulty
import dev.sudoku.app.model.GameRepository
import dev.sudoku.app.model.Puzzle
import dev.sudoku.app.model.PuzzleContent
import dev.sudoku.app.model.PuzzleRules
import dev.sudoku.app.model.SessionMetadata
import dev.sudoku.app.model.StorageOutcome
import dev.sudoku.app.model.SudokuEngine
import dev.sudoku.app.model.Variant
import dev.sudoku.app.model.challengeDate
import dev.sudoku.app.model.createSession
import dev.sudoku.app.model.dailyFormalId
import dev.sudoku.app.runtime.EngineModule
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
    fun homeAndDailySheetReadSummariesWhileNativeValidationIsBlocked() {
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
        val activity = ActivityScenario.launch(MainActivity::class.java)
        try {
            compose.waitUntil(20_000) {
                compose.onAllNodesWithText("继续上次").fetchSemanticsNodes().isNotEmpty()
            }
            compose.onNodeWithText("开始数独").assertIsEnabled()
            compose.onNodeWithText("继续上次").assertIsEnabled()
            assertEquals(0, savedReadCount.get())

            compose.onNodeWithText("每日挑战").performClick()
            compose.waitUntil(20_000) {
                compose.onAllNodesWithText("继续今日挑战").fetchSemanticsNodes().isNotEmpty()
            }
            compose.onNodeWithText("继续今日挑战").assertIsEnabled()
            assertEquals(0, savedReadCount.get())
        } finally {
            gate.complete(Unit)
            savedReadGate = null
            activity.close()
        }
    }

    @Test
    fun homeDoesNotWaitForNativeInformation() {
        hiltRule.inject()
        val activity = ActivityScenario.launch(MainActivity::class.java)
        try {
            compose.waitUntil(20_000) {
                compose.onAllNodesWithText("开始数独").fetchSemanticsNodes().isNotEmpty()
            }
            compose.onNodeWithText("开始数独").assertIsEnabled()
            compose.onNodeWithText("正在准备首页…").assertDoesNotExist()
            assertTrue(!readiness.isCompleted)
        } finally {
            readiness.complete(Unit)
            activity.close()
        }
    }
}
