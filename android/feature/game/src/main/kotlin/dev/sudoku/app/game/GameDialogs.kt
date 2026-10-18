package dev.sudoku.app.game

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import dev.sudoku.app.design.InitialDialogFocus
import dev.sudoku.app.designsystem.NumberPad

@Composable
internal fun GameSettingsDialog(
    state: GameUiState,
    onSetShowTimer: (Boolean) -> Unit,
    onSetHighlightConflicts: (Boolean) -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("对局设置与规则") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                SettingSwitch("显示计时", state.settings.showTimer, onSetShowTimer)
                SettingSwitch("标记规则冲突", state.settings.highlightConflicts, onSetHighlightConflicts)
                Text("隐藏计时不会停止计时。检查、候选数和逻辑提示会永久记为辅助使用。")
                state.session?.let { Text(ruleDescription(it.puzzle.rules)) }
                Text("切到后台自动暂停，返回后需手动继续。每日挑战按北京时间计算。")
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("关闭") } }
    )
}

@Composable
internal fun GameZoomDialog(
    state: GameUiState,
    onSelectCell: (Int) -> Unit,
    onResume: () -> Unit,
    onCancelPreparation: () -> Unit,
    onRetryPreparation: () -> Unit,
    onEnterDigit: (Int) -> Unit,
    onDismiss: () -> Unit
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        androidx.compose.material3.Surface(shape = MaterialTheme.shapes.large) {
            Column(
                Modifier.padding(16.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text("检查棋盘", style = MaterialTheme.typography.titleLarge)
                Box(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())) {
                    BoardWorkspace(
                        state,
                        onSelectCell,
                        onResume,
                        onCancelPreparation,
                        onRetryPreparation,
                        Modifier.width(540.dp)
                    )
                }
                Text(selectedDescription(state))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = {
                        onSelectCell(((state.selectedCell ?: 0) + 80) % 81)
                    }) { Text("上一格") }
                    OutlinedButton(onClick = {
                        onSelectCell(((state.selectedCell ?: 0) + 1) % 81)
                    }) { Text("下一格") }
                }
                NumberPad(state.inputEditable, state.noteMode, onEnterDigit, expandedTargets = true)
                TextButton(onClick = onDismiss) { Text("关闭") }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun GameHintSheet(
    state: GameUiState,
    onDismissHint: () -> Unit,
    onNextHint: () -> Unit,
    onApplyHint: () -> Unit
) {
    val hint = state.hint ?: return

    ModalBottomSheet(onDismissRequest = onDismissHint) {
        Column(
            Modifier.padding(24.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text("逻辑提示", style = MaterialTheme.typography.titleLarge)
            Text("第 ${state.hintStep + 1} / ${hint.steps.size} 步 · 已计入辅助使用")
            hint.steps.getOrNull(state.hintStep)?.let { Text(explainStep(it)) }
            if (state.hintStep < hint.steps.lastIndex) {
                Button(onClick = onNextHint) { Text("下一步推理") }
            } else {
                Button(onClick = onApplyHint) {
                    val row = hint.placement.cell / 9 + 1
                    val column = hint.placement.cell % 9 + 1
                    Text("应用：第 $row 行第 $column 列填 ${hint.placement.digit}")
                }
            }
            TextButton(onClick = onDismissHint) { Text("关闭提示") }
        }
    }
}

@Composable
private fun SettingSwitch(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

@Composable
internal fun PracticeReplacementDialog(onCancel: () -> Unit, onContinue: () -> Unit, onReplace: () -> Unit) {
    val cancelFocus = remember { FocusRequester() }

    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text("已有学习练习存档") },
        text = { Text("开始本课程的新练习会替换之前的学习练习。你也可以继续已有存档。") },
        dismissButton = {
            InitialDialogFocus(cancelFocus)
            TextButton(
                onClick = onCancel,
                modifier = Modifier.focusRequester(cancelFocus).focusProperties {
                    canFocus =
                        true
                }
            ) { Text("取消") }
        },
        confirmButton = {
            Column {
                TextButton(onClick = onContinue) { Text("继续存档") }
                Button(onClick = onReplace) { Text("开始新练习") }
            }
        }
    )
}

@Composable
internal fun RestartConfirmation(onDismiss: () -> Unit, onConfirm: () -> Unit) {
    val cancelFocus = remember { FocusRequester() }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("重新开始本题？") },
        text = { Text("清空当前填写和笔记。未完成的每日正式挑战会保留累计用时和辅助记录。") },
        dismissButton = {
            InitialDialogFocus(cancelFocus)
            TextButton(
                onClick = onDismiss,
                modifier = Modifier.focusRequester(cancelFocus).focusProperties { canFocus = true }
            ) { Text("取消") }
        },

        confirmButton = { Button(onClick = onConfirm) { Text("重新开始") } }
    )
}

private fun selectedDescription(state: GameUiState): String {
    val cell = state.selectedCell ?: return "先选择一个空格，再输入数字。"
    val position = "第 ${cell / 9 + 1} 行第 ${cell % 9 + 1} 列"
    if (state.session?.puzzle?.givens?.get(cell) != 0) {
        return "$position · 题目给定，不能修改"
    }
    return "$position · ${if (state.noteMode) "候选笔记模式" else "数字输入模式"}"
}
