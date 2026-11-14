package dev.sudoku.app.designsystem

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
import androidx.compose.ui.input.key.KeyEvent
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
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.sudoku.app.model.BOARD_SIZE
import dev.sudoku.app.model.Evidence
import dev.sudoku.app.model.PuzzleRules

private const val BOARD_SIDE = 9
private const val MAX_NOTE_MASK = 511

/** Immutable presentation inputs supplied by the owner of game or lesson state. */
data class SudokuBoardPresentation(
    val givens: List<Int>,
    val entries: List<Int>,
    val notes: List<Int>,
    val rules: PuzzleRules,
    val selectedCell: Int?,
    val relatedCells: Set<Int> = emptySet(),
    val conflictCells: Set<Int> = emptySet(),
    val evidenceCells: Set<Int> = emptySet(),
    val matchingDigit: Int? = null,
    val enabled: Boolean = true,
    val evidence: Evidence? = null
)

/**
 * Draw caller-owned facts and report selections without applying Sudoku rules or editing the board.
 */
@Composable
fun SudokuBoard(
    presentation: SudokuBoardPresentation,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    val givens = presentation.givens
    val entries = presentation.entries
    val notes = presentation.notes
    val rules = presentation.rules

    require(givens.size == BOARD_SIZE && entries.size == BOARD_SIZE && notes.size == BOARD_SIZE) {
        "Board drawing requires complete owned layers"
    }
    val hasValidDigits = givens.all { it in 0..BOARD_SIDE } &&
        entries.all { it in 0..BOARD_SIDE }
    val hasValidNotes = notes.all { it in 0..MAX_NOTE_MASK }
    require(hasValidDigits && hasValidNotes) { "Invalid board drawing value" }

    val colors = LocalBoardColors.current
    val focusRequesters = remember { List(BOARD_SIZE) { FocusRequester() } }
    val noteMeasurer = rememberTextMeasurer(cacheSize = 64)
    val displayed = givens.indices.map { if (givens[it] != 0) givens[it] else entries[it] }
    val sumLabels = remember(rules) {
        if (rules is PuzzleRules.Killer) {
            rules.cages.associate { it.cells.min() to it.sum.toString() }
        } else {
            emptyMap()
        }
    }
    val evidence = presentation.evidence
    val allEvidenceCells = presentation.evidenceCells + evidence?.cells.orEmpty()

    val collection = modifier.aspectRatio(1f).semantics {
        collectionInfo = CollectionInfo(BOARD_SIDE, BOARD_SIDE)
    }
    BoxWithConstraints(collection) {
        // Capture this receiver's width before entering nested layout scopes.
        val cellSize = maxWidth / BOARD_SIDE

        // Interactive cells own the labels; the drawing canvas has no separate accessible content.
        Canvas(Modifier.fillMaxSize().clearAndSetSemantics {}) {
            drawBoardBackground(
                colors,
                BoardBackground(
                    selectedCell = presentation.selectedCell,
                    relatedCells = presentation.relatedCells,
                    conflictCells = presentation.conflictCells,
                    evidenceCells = allEvidenceCells,
                    displayed = displayed,
                    matchingDigit = presentation.matchingDigit
                )
            )
            drawRuleClues(rules, colors)
            drawEvidence(evidence, colors)
            drawBoardGrid(rules, colors)
        }

        Column(Modifier.fillMaxSize()) {
            repeat(BOARD_SIDE) { row ->
                Row(Modifier.fillMaxWidth().weight(1f)) {
                    repeat(BOARD_SIDE) { column ->
                        val cell = row * BOARD_SIDE + column
                        val cellPresentation = BoardCellPresentation(
                            cell = cell,
                            given = givens[cell],
                            value = displayed[cell],
                            noteMask = notes[cell],
                            isSelected = cell == presentation.selectedCell,
                            isConflicting = cell in presentation.conflictCells,
                            hasEvidence = cell in allEvidenceCells,
                            clueLabel = sumLabels[cell],
                            evidenceDescription = evidenceCellDescription(cell, evidence),
                            rules = rules,
                            isEnabled = presentation.enabled
                        )
                        val layout = BoardCellLayout(
                            noteMeasurer = noteMeasurer,
                            cellSize = cellSize,
                            focusRequester = focusRequesters[cell],
                            modifier = Modifier.weight(1f).fillMaxSize()
                        )
                        BoardCell(cellPresentation, layout) { selected ->
                            focusRequesters[selected].requestFocus()
                            onSelect(selected)
                        }
                    }
                }
            }
        }
    }
}

internal data class BoardCellPresentation(
    val cell: Int,
    val given: Int,
    val value: Int,
    val noteMask: Int,
    val isSelected: Boolean,
    val isConflicting: Boolean,
    val hasEvidence: Boolean,
    val clueLabel: String?,
    val evidenceDescription: String,
    val rules: PuzzleRules,
    val isEnabled: Boolean
)

private data class BoardCellLayout(
    val noteMeasurer: TextMeasurer,
    val cellSize: Dp,
    val focusRequester: FocusRequester,
    val modifier: Modifier
)

private fun adjacentCell(event: KeyEvent, cell: Int): Int? {
    // Modified keys belong to the enclosing game or lesson shortcut handler.
    if (event.type != KeyEventType.KeyDown ||
        event.isCtrlPressed || event.isAltPressed || event.isMetaPressed
    ) {
        return null
    }

    val row = cell / BOARD_SIDE
    val column = cell % BOARD_SIDE
    return when (event.key) {
        Key.DirectionLeft -> if (column > 0) cell - 1 else cell
        Key.DirectionRight -> if (column < BOARD_SIDE - 1) cell + 1 else cell
        Key.DirectionUp -> if (row > 0) cell - BOARD_SIDE else cell
        Key.DirectionDown -> if (row < BOARD_SIDE - 1) cell + BOARD_SIDE else cell
        else -> null
    }
}

@Composable
private fun BoardCell(
    presentation: BoardCellPresentation,
    layout: BoardCellLayout,
    onSelect: (Int) -> Unit
) {
    val cell = presentation.cell
    val given = presentation.given
    val value = presentation.value
    val clueLabel = presentation.clueLabel
    val cellSize = layout.cellSize
    val colors = LocalBoardColors.current
    val density = LocalDensity.current
    // Convert each geometric size separately: Android font scaling is nonlinear.
    // Zoom enlarges the board; surrounding copy still follows the system font scale.
    val digitSize = with(density) { (cellSize * 0.54f).toSp() }
    val noteSize = with(density) { (cellSize * 0.22f).toSp() }
    val markerSize = with(density) { (cellSize * 0.27f).toSp() }
    var focused by remember { mutableStateOf(false) }
    val label = listOf(cellDescription(presentation), presentation.evidenceDescription)
        .filter { it.isNotBlank() }
        .joinToString("，")
    val outline = if (focused || presentation.isSelected) colors.accent else Color.Transparent
    val valueColor = if (given > 0) colors.accent else colors.text

    val focusModifier = layout.modifier
        .testTag("cell-$cell")
        .focusRequester(layout.focusRequester)
        .onFocusChanged { focused = it.isFocused }
    val keyboardModifier = focusModifier.onPreviewKeyEvent { event ->
        if (!presentation.isEnabled) {
            return@onPreviewKeyEvent false
        }

        val next = adjacentCell(event, cell) ?: return@onPreviewKeyEvent false
        onSelect(next)
        true
    }
    val selectionModifier = keyboardModifier.selectable(
        selected = presentation.isSelected,
        enabled = presentation.isEnabled,
        role = Role.Button,
        onClick = { onSelect(cell) }
    )

    Box(
        selectionModifier
            .border(if (focused) 3.dp else 2.dp, outline)
            .semantics(mergeDescendants = true) {
                contentDescription = label
                collectionItemInfo = CollectionItemInfo(cell / BOARD_SIDE, 1, cell % BOARD_SIDE, 1)
                if (presentation.isConflicting) {
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
                fontWeight = if (given > 0) FontWeight.Normal else FontWeight.Medium,
                modifier = Modifier.clearAndSetSemantics {}
            )
        } else {
            CandidateNotes(presentation.noteMask, noteSize, layout.noteMeasurer)
        }
        if (clueLabel != null) {
            Text(
                clueLabel,
                color = colors.text,
                fontSize = noteSize,
                lineHeight = noteSize,
                maxLines = 1,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.align(
                    Alignment.TopStart
                ).padding(start = 3.dp, top = 1.dp).clearAndSetSemantics {
                }
            )
        }
        if (presentation.hasEvidence && !presentation.isConflicting) {
            Text(
                "•",
                color = colors.text,
                fontSize = markerSize,
                lineHeight = markerSize,
                maxLines = 1,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.align(
                    Alignment.BottomEnd
                ).padding(end = 3.dp).clearAndSetSemantics {
                }
            )
        }
    }
}
