package dev.sudoku.app.feature.learning

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import dev.sudoku.app.designsystem.NumberPad
import dev.sudoku.app.model.learning.ExerciseAnswer
import dev.sudoku.app.model.learning.ExerciseStage

@Composable
internal fun LessonZoom(
    stage: ExerciseStage,
    state: LearningUiState,
    onCell: (Int) -> Unit,
    onDigit: (Int) -> Unit,
    onClear: () -> Unit,
    onDismiss: () -> Unit
) {
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize()) {
            Column(
                Modifier.safeDrawingPadding().padding(16.dp).lessonKeyboard(state, onDigit, onClear),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("放大棋盘", Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
                    TextButton(onClick = onDismiss) { Text("关闭放大棋盘") }
                }
                Text("可以横向和纵向滚动查看棋盘。", style = MaterialTheme.typography.bodyMedium)
                Box(
                    Modifier.weight(1f).horizontalScroll(rememberScrollState())
                        .verticalScroll(rememberScrollState())
                ) {
                    LessonBoard(stage, state, onCell, Modifier.size(540.dp))
                }
                if (state.exerciseStarted) {
                    NumberPad(
                        enabled = state.canEnterAnswer(),
                        noteMode = state.stage?.answer is ExerciseAnswer.Eliminate,
                        onDigit = onDigit,
                        expandedTargets = true,
                        digitLabel = { lessonDigitLabel(state, it) }
                    )
                }
            }
        }
    }
}
