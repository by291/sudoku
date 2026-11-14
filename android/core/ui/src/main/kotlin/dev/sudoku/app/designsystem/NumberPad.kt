package dev.sudoku.app.designsystem

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private const val DIGIT_COUNT = 9
private const val COMPACT_COLUMNS = 3

/** Touch and accessibility actions report the same digit to the session owner. */
@Composable
fun NumberPad(
    enabled: Boolean,
    noteMode: Boolean,
    onDigit: (Int) -> Unit,
    modifier: Modifier = Modifier,
    expandedTargets: Boolean = false,
    digitLabel: (Int) -> String = { if (noteMode) "笔记数字$it" else "填入数字$it" }
) {
    BoxWithConstraints(modifier.fillMaxWidth()) {
        val columns = numberPadColumns(maxWidth, expandedTargets = expandedTargets)
        val gap = if (columns == DIGIT_COUNT) 4.dp else 8.dp

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            repeat(DIGIT_COUNT / columns) { row ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(gap)) {
                    repeat(columns) { column ->
                        val digit = row * columns + column + 1
                        val key =
                            DigitKeyPresentation(digit, digitLabel(digit), isEnabled = enabled)
                        DigitKey(key, Modifier.weight(1f)) { onDigit(digit) }
                    }
                }
            }
        }
    }
}

/** Both the entry keys and game note shortcuts use the same measured column count. */
@Composable
fun numberPadColumns(availableWidth: Dp, expandedTargets: Boolean = false): Int {
    val density = LocalDensity.current
    val measurer = rememberTextMeasurer()
    val style = MaterialTheme.typography.headlineSmall.copy(fontSize = 24.sp)
    val digitWidth = remember(measurer, style, density) {
        (1..DIGIT_COUNT).maxOf { measurer.measure(it.toString(), style).size.width }
    }

    // Nine compact keys preserve direct access on phones. The zoom view offers 48 dp-wide targets.
    val minimum = if (expandedTargets) 48.dp else 28.dp
    val keyWidth = maxOf(minimum, with(density) { digitWidth.toDp() } + 12.dp)
    return if (availableWidth >= keyWidth * DIGIT_COUNT + 32.dp) DIGIT_COUNT else COMPACT_COLUMNS
}

private data class DigitKeyPresentation(val digit: Int, val label: String, val isEnabled: Boolean)

@Composable
private fun DigitKey(key: DigitKeyPresentation, modifier: Modifier, onClick: () -> Unit) {
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val colors = MaterialTheme.colorScheme

    Surface(
        onClick = onClick,
        enabled = key.isEnabled,
        interactionSource = interactionSource,
        modifier = modifier.semantics { contentDescription = key.label },
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(1.dp, colors.primary.copy(alpha = 0.35f)),
        color = if (pressed) colors.primaryContainer else colors.surface,
        contentColor = colors.primary.copy(alpha = if (key.isEnabled) 1f else 0.38f)
    ) {
        Box(Modifier.heightIn(min = 52.dp), contentAlignment = Alignment.Center) {
            val style = MaterialTheme.typography.headlineSmall.copy(fontSize = 24.sp)
            Text(key.digit.toString(), style = style)
        }
    }
}
