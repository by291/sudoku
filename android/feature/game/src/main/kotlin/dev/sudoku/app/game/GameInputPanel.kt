package dev.sudoku.app.game

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Backspace
import androidx.compose.material.icons.automirrored.outlined.Redo
import androidx.compose.material.icons.automirrored.outlined.Undo
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Lightbulb
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.sudoku.app.designsystem.NumberPad
import dev.sudoku.app.designsystem.numberPadColumns

/** Keeps the tool strip and digit entry together in both portrait and landscape. */
@Composable
internal fun GameInputPanel(
    state: GameUiState,
    onUndo: () -> Unit,
    onRedo: () -> Unit,
    onErase: () -> Unit,
    onToggleNotes: () -> Unit,
    onHint: () -> Unit,
    onDigit: (Int) -> Unit,
    onNote: (Int) -> Unit,
    onRetrySave: () -> Unit,
    onMore: () -> Unit,
    moreMenu: @Composable () -> Unit,
    modifier: Modifier
) {
    Column(modifier.padding(horizontal = 6.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val density = LocalDensity.current
            val textMeasurer = rememberTextMeasurer()
            val labelStyle = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp, fontWeight = FontWeight.Normal)
            val labelWidth = remember(textMeasurer, labelStyle, density) {
                listOf("撤销", "重做", "擦除", "笔记", "提示", "更多").maxOf {
                    textMeasurer.measure(it, labelStyle).size.width
                }
            }
            val toolWidth = maxOf(48.dp, with(density) { labelWidth.toDp() } + 12.dp)
            val columns = if (maxWidth >= toolWidth * 6 + 5.dp) 6 else 3
            FlowRow(
                Modifier.fillMaxWidth(),
                maxItemsInEachRow = columns,
                horizontalArrangement = Arrangement.spacedBy(1.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                GameTool(
                    "撤销",
                    Icons.AutoMirrored.Outlined.Undo,
                    state.editable && state.session?.undoStack?.isNotEmpty() == true,
                    Modifier.weight(1f),
                    onClick = onUndo
                )
                GameTool(
                    "重做",
                    Icons.AutoMirrored.Outlined.Redo,
                    state.editable && state.session?.redoStack?.isNotEmpty() == true,
                    Modifier.weight(1f),
                    onClick = onRedo
                )
                GameTool(
                    "擦除",
                    Icons.AutoMirrored.Outlined.Backspace,
                    state.inputEditable,
                    Modifier.weight(1f),
                    onClick = onErase
                )
                GameTool(
                    "笔记",
                    Icons.Outlined.Edit,
                    state.editable,
                    Modifier.weight(1f),
                    active = state.noteMode,
                    toggle = true,
                    onClick = onToggleNotes
                )
                GameTool(
                    "提示",
                    Icons.Outlined.Lightbulb,
                    state.editable && !state.hintPending,
                    Modifier.weight(1f),
                    onClick = onHint
                )
                Box(Modifier.weight(1f)) {
                    GameTool(
                        "更多",
                        Icons.Outlined.MoreHoriz,
                        state.session != null,
                        Modifier.fillMaxWidth(),
                        onClick = onMore
                    )
                    moreMenu()
                }
            }
        }
        GameDigits(
            enabled = state.inputEditable,
            noteMode = state.noteMode,
            noteMask = state.selectedCell?.let { state.session?.notes?.get(it) } ?: 0,
            onDigit = onDigit,
            onNote = onNote
        )
        state.save.failure?.let { failure ->
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "保存失败：${failure.message}",
                    Modifier.weight(1f),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error
                )
                TextButton(onClick = onRetrySave) { Text("重试保存") }
            }
        }
    }
}

@Composable
private fun GameTool(
    label: String,
    icon: ImageVector,
    enabled: Boolean,
    modifier: Modifier,
    active: Boolean = false,
    toggle: Boolean = false,
    onClick: () -> Unit
) {
    val tint = if (enabled) {
        MaterialTheme.colorScheme.primary
    } else {
        MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
    }
    Surface(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.semantics {
            contentDescription = label
            if (toggle) {
                selected = active
                stateDescription = if (active) "已开启" else "已关闭"
            }
        },
        shape = RoundedCornerShape(12.dp),
        color = if (active) MaterialTheme.colorScheme.primaryContainer else Color.Transparent,
        contentColor = tint
    ) {
        Column(
            Modifier.heightIn(min = 56.dp).padding(vertical = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterVertically)
        ) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(22.dp))
            Text(
                label,
                style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp, fontWeight = FontWeight.Normal)
            )
        }
    }
}

@Composable
private fun GameDigits(
    enabled: Boolean,
    noteMode: Boolean,
    noteMask: Int,
    onDigit: (Int) -> Unit,
    onNote: (Int) -> Unit
) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val columns = numberPadColumns(maxWidth)
        val keyGap = if (columns == 9) 4.dp else 8.dp
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            NumberPad(enabled, noteMode, onDigit)
            repeat(9 / columns) { row ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(keyGap)) {
                    repeat(columns) { column ->
                        val digit = row * columns + column + 1
                        // The native note mask uses bit (digit - 1) for each marked candidate.
                        val marked = noteMask and (1 shl (digit - 1)) != 0
                        val tint = MaterialTheme.colorScheme.primary.copy(
                            alpha = if (!enabled) {
                                0.3f
                            } else if (marked) {
                                1f
                            } else {
                                0.6f
                            }
                        )
                        Surface(
                            onClick = { onNote(digit) },
                            enabled = enabled,
                            modifier = Modifier.weight(1f).semantics {
                                contentDescription = "快捷笔记数字$digit"
                                selected = marked
                                stateDescription = if (marked) "已标记" else "未标记"
                            },
                            color = Color.Transparent,
                            contentColor = tint
                        ) {
                            Column(
                                Modifier.heightIn(min = 48.dp).padding(vertical = 4.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterVertically)
                            ) {
                                Text(digit.toString(), fontSize = 20.sp)
                                Spacer(
                                    Modifier.size(width = 8.dp, height = 2.dp).background(
                                        tint.copy(alpha = if (marked) 1f else 0.2f),
                                        RoundedCornerShape(1.dp)
                                    )
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
