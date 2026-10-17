package dev.yigeyinian.sudoku

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ActivityScenario
import dagger.hilt.android.testing.BindValue
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import dagger.hilt.android.testing.UninstallModules
import dev.yigeyinian.sudoku.engine.RustSudokuEngine
import dev.yigeyinian.sudoku.model.SudokuEngine
import dev.yigeyinian.sudoku.runtime.EngineModule
import kotlinx.coroutines.CompletableDeferred
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

    @BindValue @JvmField
    val engine: SudokuEngine = object : SudokuEngine by native {
        override suspend fun information() = run {
            readiness.await()
            native.information()
        }
    }

    @Test
    fun delaysStartupFeedbackWithoutDelayingReadiness() {
        hiltRule.inject()
        compose.mainClock.autoAdvance = false
        val activity = ActivityScenario.launch(MainActivity::class.java)
        try {
            compose.mainClock.advanceTimeBy(100)
            compose.onNodeWithText("正在准备数独计算组件…").assertDoesNotExist()
            compose.mainClock.advanceTimeBy(500)
            compose.onNodeWithText("正在准备数独计算组件…").assertIsDisplayed()

            readiness.complete(Unit)
            compose.mainClock.autoAdvance = true
            compose.waitUntil(20_000) {
                compose.onAllNodesWithText("开始数独").fetchSemanticsNodes().isNotEmpty()
            }

            compose.onNodeWithText("正在准备数独计算组件…").assertDoesNotExist()
        } finally {
            readiness.complete(Unit)
            compose.mainClock.autoAdvance = true
            activity.close()
        }
    }
}
