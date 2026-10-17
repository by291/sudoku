package dev.sudoku.app

import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.platform.ViewRootForTest
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.test.core.app.ActivityScenario
import dagger.hilt.android.testing.BindValue
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import dagger.hilt.android.testing.UninstallModules
import dev.sudoku.app.engine.RustSudokuEngine
import dev.sudoku.app.model.SudokuEngine
import dev.sudoku.app.runtime.EngineModule
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CompletableDeferred
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@HiltAndroidTest
@UninstallModules(EngineModule::class)
class HomeStartupTest {
    @get:Rule
    val hiltRule = HiltAndroidRule(this)

    private val startupGate = CompletableDeferred<Unit>()
    private val nativeEngine = RustSudokuEngine()

    @BindValue @JvmField
    val engine: SudokuEngine = object : SudokuEngine by nativeEngine {
        override suspend fun information() = startupGate.await().let { nativeEngine.information() }
    }

    @Test
    fun firstHomeFrameKeepsTheSameActionPositionAfterStartup() {
        hiltRule.inject()
        val frames = mutableListOf<Rect>()
        val sampled = CountDownLatch(1)

        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                val decor = activity.window.decorView
                // Observe actual drawn frames; Compose's idle synchronization would skip the jump.
                val listener = object : ViewTreeObserver.OnDrawListener {
                    override fun onDraw() {
                        val root = findComposeRoot(decor)
                        val action = root?.semanticsOwner?.rootSemanticsNode?.findText("开始数独")
                        if (action != null) {
                            frames.add(action.boundsInWindow)
                        }
                        if (frames.size >= 8) {
                            decor.post { decor.viewTreeObserver.removeOnDrawListener(this) }
                            sampled.countDown()
                        } else {
                            // Release readiness only after the startup page has drawn once.
                            decor.post { startupGate.complete(Unit) }
                            decor.postInvalidateOnAnimation()
                        }
                    }
                }
                decor.viewTreeObserver.addOnDrawListener(listener)
                decor.invalidate()
            }

            assertTrue("Home never became visible", sampled.await(15, TimeUnit.SECONDS))
            scenario.onActivity {
                frames.forEach { bounds ->
                    assertEquals("Every Home frame must use the final safe area", frames.last(), bounds)
                }
            }
        }
    }

    private fun findComposeRoot(view: View): ViewRootForTest? {
        if (view is ViewRootForTest) {
            return view
        }
        if (view is ViewGroup) {
            for (index in 0 until view.childCount) {
                findComposeRoot(view.getChildAt(index))?.let { return it }
            }
        }
        return null
    }

    private fun SemanticsNode.findText(text: String): SemanticsNode? {
        if (config.getOrNull(SemanticsProperties.Text)?.any { it.text == text } == true) {
            return this
        }
        return children.firstNotNullOfOrNull { it.findText(text) }
    }
}
