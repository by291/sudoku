package dev.sudoku.app.designsystem

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import dev.sudoku.app.model.ArrowClue
import dev.sudoku.app.model.Evidence
import dev.sudoku.app.model.PuzzleRules
import dev.sudoku.app.model.UnitReference
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

private const val DIAGONAL_STROKE_RATIO = 0.10f
private const val CAGE_INSET_RATIO = 0.09f
private const val THERMO_LINE_RATIO = 0.24f
private const val THERMO_BULB_RATIO = 0.30f
private const val ARROW_CIRCLE_RATIO = 0.33f
private const val ARROW_STROKE_RATIO = 0.045f
private const val ARROW_START_RATIO = 0.34f
private const val ARROW_HEAD_RATIO = 0.22f

private fun DrawScope.center(cell: Int): Offset {
    val side = size.width / 9
    return Offset((cell % 9 + 0.5f) * side, (cell / 9 + 0.5f) * side)
}

internal data class BoardBackground(
    val selectedCell: Int?,
    val relatedCells: Set<Int>,
    val conflictCells: Set<Int>,
    val evidenceCells: Set<Int>,
    val displayed: List<Int>,
    val matchingDigit: Int?
)

internal fun DrawScope.drawBoardBackground(colors: BoardColors, presentation: BoardBackground) {
    val matchingDigit = presentation.matchingDigit
    drawRect(colors.surface)
    val side = size.width / 9
    for (cell in 0 until 81) {
        val isMatchingDigit = matchingDigit != null && matchingDigit != 0 &&
            presentation.displayed[cell] == matchingDigit
        val background = when {
            cell in presentation.conflictCells -> colors.errorSoft
            cell == presentation.selectedCell -> colors.accentSoft
            cell in presentation.evidenceCells -> colors.evidence
            isMatchingDigit -> colors.accentSoft
            cell in presentation.relatedCells -> colors.peer
            else -> Color.Transparent
        }
        drawRect(background, Offset(cell % 9 * side, cell / 9 * side), Size(side, side))
    }
}

internal fun DrawScope.drawBoardGrid(rules: PuzzleRules, colors: BoardColors) {
    val side = size.width / 9
    for (line in 1 until 9) {
        val heavy = rules !is PuzzleRules.Jigsaw && line % 3 == 0
        val width = if (heavy) 1.dp.toPx() else 0.5.dp.toPx()
        val color = if (heavy) colors.accent else colors.accent.copy(alpha = 0.28f)
        drawLine(color, Offset(line * side, 0f), Offset(line * side, size.height), width)
        drawLine(color, Offset(0f, line * side), Offset(size.width, line * side), width)
    }
    if (rules is PuzzleRules.Jigsaw) {
        val regions = IntArray(81) { -1 }
        rules.regions.forEachIndexed { index, cells -> cells.forEach { regions[it] = index } }
        for (cell in 0 until 81) {
            val x = cell % 9 * side
            val y = cell / 9 * side
            if (cell % 9 < 8 && regions[cell] != regions[cell + 1]) {
                drawLine(
                    colors.accent,
                    Offset(x + side, y),
                    Offset(x + side, y + side),
                    1.dp.toPx()
                )
            }
            if (cell < 72 && regions[cell] != regions[cell + 9]) {
                drawLine(
                    colors.accent,
                    Offset(x, y + side),
                    Offset(x + side, y + side),
                    1.dp.toPx()
                )
            }
        }
    }
    drawRect(colors.accent, style = Stroke(1.dp.toPx()))
}

/** Draw variant clue shapes using the caller-supplied geometry. */
internal fun DrawScope.drawRuleClues(rules: PuzzleRules, colors: BoardColors) {
    val side = size.width / 9
    when (rules) {
        PuzzleRules.Classic, is PuzzleRules.Jigsaw -> Unit
        PuzzleRules.Diagonal -> drawDiagonals(side, colors)
        is PuzzleRules.Killer -> rules.cages.forEach { drawCage(it.cells, side, colors) }
        is PuzzleRules.Thermo -> rules.paths.forEach { drawThermometer(it, side, colors) }
        is PuzzleRules.Arrow -> rules.arrows.forEach { drawArrow(it, side, colors) }
    }
}

private fun DrawScope.drawDiagonals(side: Float, colors: BoardColors) {
    val stroke = Stroke(
        side * DIAGONAL_STROKE_RATIO,
        pathEffect = PathEffect.dashPathEffect(
            floatArrayOf(side * 0.16f, side * DIAGONAL_STROKE_RATIO)
        )
    )
    val path = Path().apply {
        moveTo(center(0).x, center(0).y)
        lineTo(center(80).x, center(80).y)
        moveTo(center(8).x, center(8).y)
        lineTo(center(72).x, center(72).y)
    }
    drawPath(path, colors.clueFill, style = stroke)
}

private fun DrawScope.drawCage(cells: List<Int>, side: Float, colors: BoardColors) {
    val members = cells.toSet()
    val inset = side * CAGE_INSET_RATIO
    val path = Path()

    // Leave shared edges open so each cage reads as one connected outline.
    for (cell in cells) {
        val x = cell % 9 * side
        val y = cell / 9 * side
        val left = cell % 9 > 0 && cell - 1 in members
        val right = cell % 9 < 8 && cell + 1 in members
        val top = cell >= 9 && cell - 9 in members
        val bottom = cell < 72 && cell + 9 in members
        val x1 = x + if (left) 0f else inset
        val x2 = x + side - if (right) 0f else inset
        val y1 = y + if (top) 0f else inset
        val y2 = y + side - if (bottom) 0f else inset
        if (!top) {
            path.moveTo(x1, y1)
            path.lineTo(x2, y1)
        }
        if (!bottom) {
            path.moveTo(x1, y2)
            path.lineTo(x2, y2)
        }
        if (!left) {
            path.moveTo(x1, y1)
            path.lineTo(x1, y2)
        }
        if (!right) {
            path.moveTo(x2, y1)
            path.lineTo(x2, y2)
        }
    }
    drawPath(
        path,
        colors.clueStroke,
        style = Stroke(
            1.dp.toPx(),
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(side * 0.07f, side * 0.05f))
        )
    )
}

private fun DrawScope.drawThermometer(cells: List<Int>, side: Float, colors: BoardColors) {
    val path = pathThrough(cells)
    drawPath(path, colors.clueFill, style = Stroke(side * THERMO_LINE_RATIO, cap = StrokeCap.Round))
    cells.firstOrNull()?.let { drawCircle(colors.clueFill, side * THERMO_BULB_RATIO, center(it)) }
}

private fun DrawScope.drawArrow(arrow: ArrowClue, side: Float, colors: BoardColors) {
    val start = center(arrow.circle)
    drawCircle(
        colors.clueStroke,
        side * ARROW_CIRCLE_RATIO,
        start,
        style = Stroke(side * ARROW_STROKE_RATIO)
    )
    if (arrow.shaft.isEmpty()) {
        return
    }

    val next = center(arrow.shaft.first())
    val delta = next - start
    val distance = hypot(delta.x, delta.y)
    // Start outside the circle so the shaft does not cross the clue digit.
    val path = Path().apply {
        if (distance > 0) {
            val x = start.x + delta.x * side * ARROW_START_RATIO / distance
            val y = start.y + delta.y * side * ARROW_START_RATIO / distance
            moveTo(x, y)
        } else {
            moveTo(start.x, start.y)
        }
        arrow.shaft.forEach {
            val point = center(it)
            lineTo(point.x, point.y)
        }
    }
    drawPath(
        path,
        colors.clueStroke,
        style = Stroke(side * ARROW_STROKE_RATIO, cap = StrokeCap.Round)
    )
    val tip = center(arrow.shaft.last())
    val before = center(arrow.shaft.dropLast(1).lastOrNull() ?: arrow.circle)
    val angle = atan2(tip.y - before.y, tip.x - before.x)
    val length = side * ARROW_HEAD_RATIO
    for (offset in listOf(-Math.PI.toFloat() / 5, Math.PI.toFloat() / 5)) {
        drawLine(
            colors.clueStroke,
            tip,
            Offset(
                tip.x - length * cos(angle + offset),
                tip.y - length * sin(angle + offset)
            ),
            side * ARROW_STROKE_RATIO,
            StrokeCap.Round
        )
    }
}

private fun DrawScope.pathThrough(cells: List<Int>): Path = Path().apply {
    cells.forEachIndexed { index, cell ->
        val point = center(cell)
        if (index == 0) {
            moveTo(point.x, point.y)
        } else {
            lineTo(point.x, point.y)
        }
    }
}

internal fun DrawScope.drawEvidence(evidence: Evidence?, colors: BoardColors) {
    if (evidence == null) {
        return
    }

    val side = size.width / 9
    val color = colors.accent.copy(alpha = 0.65f)
    when (evidence) {
        is Evidence.Wing -> evidence.wings.forEach {
            drawLine(color, center(evidence.pivot), center(it), 2.dp.toPx())
        }
        is Evidence.Coloring -> {
            evidence.links.forEach { link ->
                if (link.cells.size == 2) {
                    drawLine(color, center(link.cells[0]), center(link.cells[1]), 2.dp.toPx())
                }
            }
            evidence.colors.forEachIndexed { index, cells ->
                val groupColor = if (index == 0) colors.accent else colors.error
                val strokeWidth = if (index == 0) 1.5.dp.toPx() else 3.dp.toPx()

                cells.forEach { cell ->
                    drawCircle(groupColor, side * 0.37f, center(cell), style = Stroke(strokeWidth))
                }
            }
        }
        is Evidence.Fish -> {
            evidence.bases.forEach { drawEvidenceUnit(it, color, false) }
            evidence.covers.forEach { drawEvidenceUnit(it, color, true) }
        }
        else -> evidence.cells.forEach { cell ->
            val origin = center(cell) - Offset(side * 0.38f, side * 0.38f)
            drawRect(color, origin, Size(side * 0.76f, side * 0.76f), style = Stroke(1.dp.toPx()))
        }
    }
}

private fun DrawScope.drawEvidenceUnit(unit: UnitReference, color: Color, dashed: Boolean) {
    val ends = when (unit.kind) {
        "row" -> unit.index * 9 to unit.index * 9 + 8
        "column" -> unit.index to unit.index + 72
        else -> return
    }
    drawLine(
        color,
        center(ends.first),
        center(ends.second),
        2.dp.toPx(),
        pathEffect = if (dashed) {
            PathEffect.dashPathEffect(
                floatArrayOf(6.dp.toPx(), 4.dp.toPx())
            )
        } else {
            null
        }
    )
}
