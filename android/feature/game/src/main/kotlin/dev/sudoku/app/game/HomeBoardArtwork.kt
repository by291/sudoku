package dev.sudoku.app.game

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import kotlin.math.cos
import kotlin.math.sin

/** Decorative echo of the Web hero, deliberately excluded from the playable board semantics. */
@Composable
internal fun HomeBoardArtwork(modifier: Modifier = Modifier) {
    val colors = MaterialTheme.colorScheme
    val textMeasurer = rememberTextMeasurer()

    BoxWithConstraints(modifier, contentAlignment = Alignment.Center) {
        // Reserve the rotated square's complete bounds so it cannot overlap copy or actions.
        val tiltRadians = Math.toRadians(8.0)
        val rotatedBoundsRatio = (cos(tiltRadians) + sin(tiltRadians)).toFloat()
        val boardSize = minOf(maxWidth, maxHeight) * 0.92f / rotatedBoundsRatio

        Canvas(
            Modifier.size(boardSize).rotate(-8f).shadow(6.dp, RoundedCornerShape(6.dp))
                .clip(RoundedCornerShape(6.dp)).background(colors.surface).clearAndSetSemantics { }
        ) {
            val cellSize = size.width / 9
            val highlights = setOf(5, 13, 21, 30, 39, 48, 57, 65, 73)

            // Fixed illustration data mirrors Web's sparse grid; it is not a generated puzzle.
            for (cell in 0 until 81) {
                val origin = Offset(cell % 9 * cellSize, cell / 9 * cellSize)
                if (cell in highlights) {
                    drawRect(colors.primaryContainer, origin, Size(cellSize, cellSize))
                }
                if ((cell + 1) % 5 == 0) {
                    val label = textMeasurer.measure(
                        ((cell + 1) % 9 + 1).toString(),
                        TextStyle(
                            color = colors.primary,
                            fontSize = (cellSize * 0.62f).toSp(),
                            fontWeight = FontWeight.Medium
                        )
                    )
                    drawText(
                        label,
                        topLeft =
                        origin + Offset((cellSize - label.size.width) / 2, (cellSize - label.size.height) / 2)
                    )
                }
            }
            for (line in 1 until 9) {
                val major = line % 3 == 0
                val stroke = if (major) 0.8.dp.toPx() else 0.35.dp.toPx()
                val color = if (major) colors.primary.copy(alpha = 0.6f) else colors.outline.copy(alpha = 0.3f)
                val position = line * cellSize
                drawLine(color, Offset(position, 0f), Offset(position, size.height), stroke)
                drawLine(color, Offset(0f, position), Offset(size.width, position), stroke)
            }
            drawRect(colors.primary.copy(alpha = 0.6f), style = Stroke(1.5.dp.toPx()))
        }
    }
}
