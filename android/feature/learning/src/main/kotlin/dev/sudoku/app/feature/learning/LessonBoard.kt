package dev.sudoku.app.feature.learning

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import dev.sudoku.app.designsystem.SudokuBoard
import dev.sudoku.app.model.learning.ExerciseStage

@Composable
internal fun LessonBoard(stage: ExerciseStage, state: LearningUiState, onCell: (Int) -> Unit, modifier: Modifier) {
    val entries = List(81) { cell ->
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
    val showEvidence = !state.exerciseStarted || state.feedback?.correct == true
    SudokuBoard(
        givens = stage.board,
        entries = entries,
        notes = notes,
        rules = stage.rules,
        selectedCell = if (state.exerciseStarted) state.selectedCell else null,
        onSelect = onCell,
        modifier = modifier,
        evidenceCells = if (showEvidence) stage.step.evidence.cells.toSet() else emptySet(),
        evidence = if (showEvidence) stage.step.evidence else null,
        enabled = state.exerciseStarted && !state.busy && state.feedback?.correct != true
    )
}
