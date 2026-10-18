package dev.sudoku.app.game

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.sudoku.app.design.rememberDelayedProgress
import dev.sudoku.app.designsystem.SudokuBoard
import dev.sudoku.app.designsystem.formatElapsedTime
import dev.sudoku.app.model.SessionMetadata

@Composable
internal fun BoardWorkspace(
    state: GameUiState,
    onSelect: (Int) -> Unit,
    onResume: () -> Unit,
    onCancelPreparation: () -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier
) {
    val session = state.session
    // Reserve the final square before a session exists; loading feedback never adds an outer row.
    Box(
        modifier.widthIn(max = 620.dp).aspectRatio(1f).testTag("game-board-workspace"),
        contentAlignment = Alignment.Center
    ) {
        if (session == null || state.phase == GamePhase.PREPARING) {
            BoardPreparation(state, onCancelPreparation, onRetry)
        } else if (state.phase == GamePhase.PAUSED) {
            androidx.compose.material3.Surface(
                Modifier.fillMaxWidth().aspectRatio(1f),
                shape = MaterialTheme.shapes.medium,
                color = MaterialTheme.colorScheme.surfaceVariant
            ) {
                Column(
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("对局已暂停", style = MaterialTheme.typography.headlineSmall)
                    Button(
                        onClick = onResume,
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary),
                        enabled = state.phase == GamePhase.PAUSED,
                        modifier = Modifier.padding(top = 16.dp)
                    ) { Text("继续对局") }
                }
            }
        } else {
            val step = state.hint?.steps?.getOrNull(state.hintStep)
            SudokuBoard(
                givens = session.puzzle.givens,
                entries = session.entries,
                notes = session.notes,
                rules = session.puzzle.rules,
                selectedCell = state.selectedCell,
                onSelect = onSelect,
                modifier = Modifier.fillMaxWidth(),
                relatedCells = state.selectedCell?.let {
                    state.metadata?.relatedCells?.getOrNull(it)?.toSet()
                }.orEmpty(),

                conflictCells = if (state.settings.highlightConflicts) {
                    state.conflicts + state.reviewCells
                } else {
                    state.reviewCells
                },

                evidenceCells = step?.evidence?.cells?.toSet().orEmpty(),
                matchingDigit = state.selectedCell?.let { cell ->
                    session.puzzle.givens[cell].takeIf { it != 0 } ?: session.entries[cell].takeIf { it != 0 }
                },

                enabled = state.phase != GamePhase.PREPARING,
                evidence = step?.evidence
            )
        }
    }
}

@Composable
private fun BoardPreparation(state: GameUiState, onCancel: () -> Unit, onRetry: () -> Unit) {
    val showProgress = rememberDelayedProgress(state.phase == GamePhase.PREPARING)
    androidx.compose.material3.Surface(
        Modifier.fillMaxSize(),
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surfaceVariant
    ) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(
                Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                if (showProgress) {
                    CircularProgressIndicator(Modifier.size(24.dp))
                    Text(if (state.preparationCommitting) "正在保存新对局…" else "正在准备对局…")
                    TextButton(onClick = onCancel, enabled = !state.preparationCommitting) { Text("取消") }
                }
                if (state.session == null) {
                    state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    state.message?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    if (state.phase != GamePhase.PREPARING && (state.error != null || state.message != null)) {
                        Button(onClick = onRetry) { Text("重试") }
                    }
                }
            }
        }
    }
}

@Composable
internal fun BoardStatus(state: GameUiState) {
    val showConflicts = rememberDelayedProgress(state.conflictPending)
    val showNotes = rememberDelayedProgress(state.notesPending)
    val showHint = rememberDelayedProgress(state.hintPending)

    val statusLineHeight = with(LocalDensity.current) { MaterialTheme.typography.bodyLarge.lineHeight.toDp() }
    Row(
        Modifier.fillMaxWidth().padding(bottom = 12.dp).heightIn(min = statusLineHeight),
        verticalAlignment = Alignment.CenterVertically
    ) {
        val daily = state.session?.metadata as? SessionMetadata.Daily
        // Reuse one line for analysis feedback so centered controls never shift.
        val status = when {
            showNotes -> "正在生成候选数；继续填写会取消本次计算。"
            showHint -> "正在寻找可验证的逻辑推理…"
            showConflicts -> "正在检查当前棋盘规则…"
            else -> daily?.let { "${it.challengeDate} · ${if (it.formalAttempt) "正式挑战" else "每日练习"}" }.orEmpty()
        }
        Text(
            status,
            Modifier.weight(1f),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        if (state.settings.showTimer) {
            Text(
                formatElapsedTime(state.elapsedMs),
                Modifier.padding(end = 4.dp),
                fontSize = 16.sp,
                fontFamily = FontFamily.Monospace
            )
        }
    }
}
