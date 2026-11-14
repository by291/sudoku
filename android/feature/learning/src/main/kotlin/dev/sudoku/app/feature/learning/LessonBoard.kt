package dev.sudoku.app.feature.learning

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import dev.sudoku.app.designsystem.SudokuBoard
import dev.sudoku.app.designsystem.SudokuBoardPresentation
import dev.sudoku.app.model.BOARD_SIZE
import dev.sudoku.app.model.learning.ExerciseStage

@Composable
internal fun LessonBoard(
    stage: ExerciseStage,
    state: LearningUiState,
    onCell: (Int) -> Unit,
    modifier: Modifier
) {
    val entries = List(BOARD_SIZE) { cell ->
        if (state.exerciseStarted && state.placement?.cell == cell) state.placement.digit else 0
    }
    val notes = if (state.exerciseStarted) {
        stage.candidates.mapIndexed { cell, mask ->
            state.removals.filter { it.cell == cell }.fold(mask) { visible, pair ->
                visible and (1 shl (pair.digit - 1)).inv()
            }
        }
    } else {
        stage.candidates
    }
    // Evidence is part of the answer and must stay hidden until the player commits it.
    val shouldShowEvidence = !state.exerciseStarted || state.feedback?.correct == true
    val evidence = stage.step.evidence.takeIf { shouldShowEvidence }
    val presentation = SudokuBoardPresentation(
        givens = stage.board,
        entries = entries,
        notes = notes,
        rules = stage.rules,
        selectedCell = state.selectedCell.takeIf { state.exerciseStarted },
        evidence = evidence,
        enabled = state.exerciseStarted && !state.busy && state.feedback?.correct != true
    )

    SudokuBoard(presentation, onSelect = onCell, modifier = modifier)
}
