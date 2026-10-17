package dev.sudoku.app.designsystem

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.LocalTextStyle
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.drawText
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt
import kotlin.math.sign

/** Draws the existing third-cell note grid without allocating nine layout boxes per empty cell. */
@Composable
internal fun CandidateNotes(mask: Int, noteSize: TextUnit, measurer: TextMeasurer) {
    if (mask == 0) {
        return
    }
    val style = LocalTextStyle.current.copy(
        color = LocalBoardColors.current.muted,
        fontSize = noteSize,
        lineHeight = noteSize
    )
    Spacer(
        Modifier.fillMaxSize().padding(3.dp).clearAndSetSemantics {}.drawWithCache {
            // Match Compose Row/Column weight rounding, including remainder pixels in the first slots.
            val widths = noteSlotSizes(size.width.roundToInt())
            val heights = noteSlotSizes(size.height.roundToInt())
            val glyphs = (1..9).filter { mask and (1 shl (it - 1)) != 0 }.map { digit ->
                val column = (digit - 1) % 3
                val row = (digit - 1) / 3
                val text = measurer.measure(
                    digit.toString(),
                    style = style,
                    maxLines = 1,
                    constraints = Constraints(maxWidth = widths[column], maxHeight = heights[row])
                )
                val slotLeft = widths.take(column).sum()
                val left = if (layoutDirection == LayoutDirection.Ltr) {
                    slotLeft
                } else {
                    size.width.roundToInt() - slotLeft - widths[column]
                }
                val top = heights.take(row).sum()
                val offset = Offset(
                    (left + ((widths[column] - text.size.width) / 2f).roundToInt()).toFloat(),
                    (top + ((heights[row] - text.size.height) / 2f).roundToInt()).toFloat()
                )
                text to offset
            }
            onDrawBehind {
                glyphs.forEach { (text, offset) -> drawText(text, topLeft = offset) }
            }
        }
    )
}

private fun noteSlotSizes(total: Int): List<Int> {
    val rounded = (total / 3f).roundToInt()
    var remainder = total - rounded * 3
    return List(3) {
        val adjustment = remainder.sign
        remainder -= adjustment
        rounded + adjustment
    }
}
