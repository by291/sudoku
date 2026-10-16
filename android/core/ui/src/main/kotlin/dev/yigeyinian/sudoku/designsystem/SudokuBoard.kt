package dev.yigeyinian.sudoku.designsystem

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isAltPressed
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isMetaPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.CollectionInfo
import androidx.compose.ui.semantics.CollectionItemInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.collectionInfo
import androidx.compose.ui.semantics.collectionItemInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import dev.yigeyinian.sudoku.model.Evidence
import dev.yigeyinian.sudoku.model.PuzzleRules

/** Controlled drawing and input only. The caller supplies all mathematical relationships and conflicts. */
@Composable
fun SudokuBoard(
    givens: List<Int>,
    entries: List<Int>,
    notes: List<Int>,
    rules: PuzzleRules,
    selectedCell: Int?,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
    relatedCells: Set<Int> = emptySet(),
    conflictCells: Set<Int> = emptySet(),
    evidenceCells: Set<Int> = emptySet(),
    matchingDigit: Int? = null,
    enabled: Boolean = true,
    evidence: Evidence? = null
) {
    require(givens.size == 81 && entries.size == 81 && notes.size == 81) {
        "Board drawing requires complete owned layers"
    }
    require(
        givens.all {
            it in 0..9
        } && entries.all { it in 0..9 } && notes.all { it in 0..511 }
    ) { "Invalid board drawing value" }
    val colors = LocalBoardColors.current
    val focusRequesters = remember { List(81) { FocusRequester() } }
    val displayed = givens.indices.map { if (givens[it] != 0) givens[it] else entries[it] }
    val sumLabels = remember(rules) {
        if (rules is PuzzleRules.Killer) {
            rules.cages.associate { it.cells.min() to it.sum.toString() }
        } else {
            emptyMap()
        }
    }
    val allEvidenceCells = evidenceCells + (evidence?.cells ?: emptyList())

    BoxWithConstraints(modifier.aspectRatio(1f).semantics { collectionInfo = CollectionInfo(9, 9) }) {
        // Capture this receiver's width before entering nested layout scopes.
        val cellSize = maxWidth / 9
        Canvas(Modifier.fillMaxSize().clearAndSetSemantics {}) {
            drawBoardBackground(
                colors,
                selectedCell,
                relatedCells,
                conflictCells,
                allEvidenceCells,
                displayed,
                matchingDigit
            )
            drawRuleClues(rules, colors)
            drawEvidence(evidence, colors)
            drawBoardGrid(rules, colors)
        }

        Column(Modifier.fillMaxSize()) {
            repeat(9) { row ->
                Row(Modifier.fillMaxWidth().weight(1f)) {
                    repeat(9) { column ->
                        val cell = row * 9 + column
                        BoardCell(
                            cell = cell,
                            given = givens[cell],
                            value = displayed[cell],
                            noteMask = notes[cell],
                            selected = cell == selectedCell,
                            conflict = cell in conflictCells,
                            evidence = cell in allEvidenceCells,
                            clueLabel = sumLabels[cell],
                            evidenceDescription = evidenceCellDescription(cell, evidence),
                            rules = rules,
                            enabled = enabled,
                            cellSize = cellSize,
                            focusRequester = focusRequesters[cell],
                            modifier = Modifier.weight(1f).fillMaxSize(),
                            onSelect = {
                                focusRequesters[it].requestFocus()
                                onSelect(it)
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun BoardCell(
    cell: Int,
    given: Int,
    value: Int,
    noteMask: Int,
    selected: Boolean,
    conflict: Boolean,
    evidence: Boolean,
    clueLabel: String?,
    evidenceDescription: String,
    rules: PuzzleRules,
    enabled: Boolean,
    cellSize: Dp,
    focusRequester: FocusRequester,
    modifier: Modifier,
    onSelect: (Int) -> Unit
) {
    val colors = LocalBoardColors.current
    val density = LocalDensity.current
    // Convert each geometric size separately: Android font scaling is nonlinear.
    // Zoom enlarges the board; surrounding copy still follows the system font scale.
    val digitSize = with(density) { (cellSize * 0.50f).toSp() }
    val noteSize = with(density) { (cellSize * 0.22f).toSp() }
    val markerSize = with(density) { (cellSize * 0.27f).toSp() }
    var focused by remember { mutableStateOf(false) }
    val label = listOf(
        cellDescription(cell, given, value, noteMask, conflict, evidence, rules),
        evidenceDescription
    ).filter {
        it.isNotBlank()
    }.joinToString("，")
    val outline = when {
        focused -> colors.accent
        selected -> colors.accent
        else -> Color.Transparent
    }
    val valueColor = when {
        conflict -> colors.error
        given > 0 -> colors.text
        else -> colors.accent
    }

    Box(
        modifier
            .testTag("cell-$cell")
            .focusRequester(focusRequester)
            .onFocusChanged { focused = it.isFocused }
            .onPreviewKeyEvent { event ->
                if (!enabled || event.type != KeyEventType.KeyDown || event.isCtrlPressed || event.isAltPressed ||
                    event.isMetaPressed
                ) {
                    false
                } else {
                    val next = when (event.key) {
                        Key.DirectionLeft -> if (cell % 9 > 0) cell - 1 else cell
                        Key.DirectionRight -> if (cell % 9 < 8) cell + 1 else cell
                        Key.DirectionUp -> if (cell >= 9) cell - 9 else cell
                        Key.DirectionDown -> if (cell < 72) cell + 9 else cell
                        else -> null
                    }
                    if (next != null) {
                        onSelect(next)
                        true
                    } else {
                        false
                    }
                }
            }
            .selectable(selected = selected, enabled = enabled, role = Role.Button, onClick = { onSelect(cell) })
            .border(if (focused) 3.dp else 2.dp, outline)
            .semantics(mergeDescendants = true) {
                contentDescription = label
                collectionItemInfo = CollectionItemInfo(cell / 9, 1, cell % 9, 1)
                if (conflict) {
                    error("冲突，请检查")
                }
            },
        contentAlignment = Alignment.Center
    ) {
        if (value > 0) {
            Text(
                value.toString(),
                color = valueColor,
                fontSize = digitSize,
                lineHeight = digitSize,
                maxLines = 1,
                fontWeight = if (given > 0) FontWeight.SemiBold else FontWeight.Medium,
                modifier = Modifier.clearAndSetSemantics {}
            )
        } else {
            CandidateNotes(noteMask, noteSize)
        }
        if (clueLabel != null) {
            Text(
                clueLabel,
                color = colors.text,
                fontSize = noteSize,
                lineHeight = noteSize,
                maxLines = 1,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.align(Alignment.TopStart).padding(start = 3.dp, top = 1.dp).clearAndSetSemantics {}
            )
        }
        if (conflict || evidence) {
            Text(
                if (conflict) "!" else "•",
                color = if (conflict) colors.error else colors.text,
                fontSize = markerSize,
                lineHeight = markerSize,
                maxLines = 1,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.align(Alignment.BottomEnd).padding(end = 3.dp).clearAndSetSemantics {}
            )
        }
    }
}

@Composable
private fun CandidateNotes(mask: Int, noteSize: TextUnit) {
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
