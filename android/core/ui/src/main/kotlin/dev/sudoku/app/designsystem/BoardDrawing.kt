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
import dev.sudoku.app.model.Evidence
import dev.sudoku.app.model.PuzzleRules
import dev.sudoku.app.model.UnitReference
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

private fun DrawScope.center(cell: Int): Offset {
    val side = size.width / 9
    return Offset((cell % 9 + 0.5f) * side, (cell / 9 + 0.5f) * side)
}

internal fun DrawScope.drawBoardBackground(
    colors: BoardColors,
    selectedCell: Int?,
    relatedCells: Set<Int>,
    conflicts: Set<Int>,
    evidence: Set<Int>,
    values: List<Int>,
    matchingDigit: Int?
) {
    drawRect(colors.surface)
    val side = size.width / 9
    for (cell in 0 until 81) {
        val background = when {
            cell in conflicts -> colors.errorSoft
            cell == selectedCell -> colors.accentSoft
            cell in evidence -> colors.evidence
            matchingDigit != null && matchingDigit != 0 && values[cell] == matchingDigit -> colors.accentSoft
            cell in relatedCells -> colors.peer
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
                drawLine(colors.accent, Offset(x + side, y), Offset(x + side, y + side), 1.dp.toPx())
            }
            if (cell < 72 && regions[cell] != regions[cell + 9]) {
                drawLine(colors.accent, Offset(x, y + side), Offset(x + side, y + side), 1.dp.toPx())
            }
        }
    }
    drawRect(colors.accent, style = Stroke(1.dp.toPx()))
}

/** Only geometry is drawn here; mathematical support and constraints remain supplied by Rust. */
internal fun DrawScope.drawRuleClues(rules: PuzzleRules, colors: BoardColors) {
    val side = size.width / 9
    when (rules) {
        PuzzleRules.Classic -> Unit
        PuzzleRules.Diagonal -> {
            val stroke = Stroke(
                side * 0.10f,
                pathEffect = PathEffect.dashPathEffect(
                    floatArrayOf(side * 0.16f, side * 0.10f)
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
        is PuzzleRules.Jigsaw -> Unit
        is PuzzleRules.Killer -> rules.cages.forEach { cage ->
            val members = cage.cells.toSet()
            val inset = side * 0.09f
            val path = Path()
            for (cell in cage.cells) {
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
        is PuzzleRules.Thermo -> rules.paths.forEach { cells ->
            val path = pathThrough(cells)
            drawPath(path, colors.clueFill, style = Stroke(side * 0.24f, cap = StrokeCap.Round))
            cells.firstOrNull()?.let { drawCircle(colors.clueFill, side * 0.30f, center(it)) }
        }
        is PuzzleRules.Arrow -> rules.arrows.forEach { arrow ->
            val start = center(arrow.circle)
            drawCircle(colors.clueStroke, side * 0.33f, start, style = Stroke(side * 0.045f))
            if (arrow.shaft.isNotEmpty()) {
                val next = center(arrow.shaft.first())
                val delta = next - start
                val distance = hypot(delta.x, delta.y)
                val path = Path().apply {
                    if (distance > 0) {
                        moveTo(start.x + delta.x * side * 0.34f / distance, start.y + delta.y * side * 0.34f / distance)
                    } else {
                        moveTo(start.x, start.y)
                    }
                    arrow.shaft.forEach {
                        val point = center(it)
                        lineTo(point.x, point.y)
                    }
                }
                drawPath(path, colors.clueStroke, style = Stroke(side * 0.045f, cap = StrokeCap.Round))
                val tip = center(arrow.shaft.last())
                val before = center(arrow.shaft.dropLast(1).lastOrNull() ?: arrow.circle)
                val angle = atan2(tip.y - before.y, tip.x - before.x)
                val length = side * 0.22f
                for (offset in listOf(-Math.PI.toFloat() / 5, Math.PI.toFloat() / 5)) {
                    drawLine(
                        colors.clueStroke,
                        tip,
                        Offset(
                            tip.x - length * cos(angle + offset),
                            tip.y - length * sin(angle + offset)
                        ),
                        side * 0.045f,
                        StrokeCap.Round
                    )
                }
            }
        }
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
        is Evidence.Wing -> evidence.wings.forEach { drawLine(color, center(evidence.pivot), center(it), 2.dp.toPx()) }
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
        pathEffect = if (dashed) PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 4.dp.toPx())) else null
    )
}
