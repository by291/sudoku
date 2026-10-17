package dev.yigeyinian.sudoku.designsystem

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
        val columns = numberPadColumns(maxWidth, expandedTargets)
        val gap = if (columns == 9) 4.dp else 8.dp
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            repeat(9 / columns) { row ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(gap)) {
                    repeat(columns) { column ->
                        val digit = row * columns + column + 1
                        DigitKey(digit, enabled, digitLabel(digit), { onDigit(digit) }, Modifier.weight(1f))
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
        (1..9).maxOf { measurer.measure(it.toString(), style).size.width }
    }
    // Nine compact keys preserve direct access on phones. The zoom view offers 48 dp-wide targets.
    val minimum = if (expandedTargets) 48.dp else 28.dp
    val keyWidth = maxOf(minimum, with(density) { digitWidth.toDp() } + 12.dp)
    return if (availableWidth >= keyWidth * 9 + 32.dp) 9 else 3
}

@Composable
private fun DigitKey(digit: Int, enabled: Boolean, label: String, onClick: () -> Unit, modifier: Modifier) {
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val colors = MaterialTheme.colorScheme
    Surface(
        onClick = onClick,
        enabled = enabled,
        interactionSource = interactionSource,
        modifier = modifier.semantics { contentDescription = label },
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(1.dp, colors.primary.copy(alpha = 0.35f)),
        color = if (pressed) colors.primaryContainer else colors.surface,
        contentColor = colors.primary.copy(alpha = if (enabled) 1f else 0.38f)
    ) {
        Box(Modifier.heightIn(min = 52.dp), contentAlignment = Alignment.Center) {
            Text(digit.toString(), style = MaterialTheme.typography.headlineSmall.copy(fontSize = 24.sp))
        }
    }
}
