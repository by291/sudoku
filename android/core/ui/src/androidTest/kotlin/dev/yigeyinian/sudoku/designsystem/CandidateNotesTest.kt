package dev.yigeyinian.sudoku.designsystem

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import dev.yigeyinian.sudoku.model.ThemePreference
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class CandidateNotesTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun cachedDrawingMatchesTheOriginalNoteLayoutPixelForPixel() {
        val legacy = mutableStateOf(true)
        val sample = mutableStateOf(NoteSample())
        compose.setContent {
            val density = LocalDensity.current
            val current = sample.value
            CompositionLocalProvider(
                LocalDensity provides Density(density.density, current.fontScale),
                LocalLayoutDirection provides current.direction
            ) {
                YigeTheme(current.theme) {
                    Surface(Modifier.size(current.size.dp).testTag("notes")) {
                        val size = with(LocalDensity.current) { (current.size.dp * 0.22f).toSp() }
                        if (legacy.value) {
                            LegacyCandidateNotes(current.mask, size)
                        } else {
                            CandidateNotes(current.mask, size, rememberTextMeasurer(cacheSize = 64))
                        }
                    }
                }
            }
        }

        val samples = listOf(
            NoteSample(),
            NoteSample(size = 35.5f, mask = 85),
            NoteSample(size = 40.333f, mask = 256),
            NoteSample(size = 60f, fontScale = 2f, theme = ThemePreference.DARK),
            NoteSample(size = 40.333f, direction = LayoutDirection.Rtl),
            NoteSample(mask = 0)
        )
        for (current in samples) {
            compose.runOnIdle {
                sample.value = current
                legacy.value = true
            }
            val before = compose.onNodeWithTag("notes").captureToImage().toPixelMap()
            compose.runOnIdle { legacy.value = false }
            val after = compose.onNodeWithTag("notes").captureToImage().toPixelMap()

            assertEquals(before.width, after.width)
            assertEquals(before.height, after.height)
            var differences = 0
            for (y in 0 until before.height) {
                for (x in 0 until before.width) {
                    if (before[x, y] != after[x, y]) {
                        differences++
                    }
                }
            }
            assertEquals("Visual changes for $current", 0, differences)
        }
    }
}

private data class NoteSample(
    val size: Float = 40f,
    val mask: Int = 511,
    val fontScale: Float = 1f,
    val theme: ThemePreference = ThemePreference.LIGHT,
    val direction: LayoutDirection = LayoutDirection.Ltr
)

// Frozen pre-optimization layout is the visual oracle, independent of the cached drawing code.
@Composable
private fun LegacyCandidateNotes(mask: Int, noteSize: TextUnit) {
    val colors = LocalBoardColors.current
    Column(Modifier.fillMaxSize().padding(3.dp).clearAndSetSemantics {}) {
        repeat(3) { row ->
            Row(Modifier.fillMaxWidth().weight(1f)) {
                repeat(3) { column ->
                    val digit = row * 3 + column + 1
                    Box(Modifier.weight(1f).fillMaxSize(), contentAlignment = Alignment.Center) {
                        if (mask and (1 shl (digit - 1)) != 0) {
                            // A note owns a third-cell; the inherited body line height clips its glyph.
                            Text(
                                digit.toString(),
                                color = colors.muted,
                                fontSize = noteSize,
                                lineHeight = noteSize,
                                maxLines = 1
                            )
                        }
                    }
                }
            }
        }
    }
}
