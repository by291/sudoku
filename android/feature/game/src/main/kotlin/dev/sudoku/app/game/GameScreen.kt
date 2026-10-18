package dev.sudoku.app.game

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import dev.sudoku.app.designsystem.difficultyLabel
import dev.sudoku.app.designsystem.formatElapsedTime
import dev.sudoku.app.designsystem.variantLabel
import dev.sudoku.app.model.GameMode
import dev.sudoku.app.model.variant

/** Controlled game presentation; platform lifecycle and durable departure remain in GameRoute. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun GameScreen(
    state: GameUiState,
    departing: Boolean,
    onLeave: () -> Unit,
    onRecords: () -> Unit,
    onRetryPreparation: () -> Unit,
    onCheckEntries: () -> Unit,
    onGenerateNotes: () -> Unit,
    onPause: () -> Unit,
    onSelectCell: (Int) -> Unit,
    onResume: () -> Unit,
    onCancelPreparation: () -> Unit,
    onRetrySave: () -> Unit,
    onSetShowTimer: (Boolean) -> Unit,
    onSetHighlightConflicts: (Boolean) -> Unit,
    onCancelPracticeReplacement: () -> Unit,
    onConfirmPracticeReplacement: () -> Unit,
    onRestart: () -> Unit,
    onDismissHint: () -> Unit,
    onNextHint: () -> Unit,
    onApplyHint: () -> Unit,
    onEnterDigit: (Int) -> Unit,
    onToggleNote: (Int) -> Unit,
    onToggleNotes: () -> Unit,
    onUndo: () -> Unit,
    onRedo: () -> Unit,
    onRequestHint: () -> Unit,
    onErase: () -> Unit
) {
    var menuOpen by remember { mutableStateOf(false) }
    var settingsOpen by remember { mutableStateOf(false) }
    var restartOpen by remember { mutableStateOf(false) }
    var zoomOpen by remember { mutableStateOf(false) }
    val modalOpen = departing || menuOpen || settingsOpen || restartOpen || zoomOpen ||
        state.hint != null || state.practiceReplacement != null

    val moreMenu: @Composable () -> Unit = {
        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
            Text("辅助工具 · 使用后记为辅助完成", Modifier.padding(16.dp), style = MaterialTheme.typography.labelMedium)
            DropdownMenuItem(
                text = { Text("检查填写") },
                onClick = {
                    menuOpen = false
                    onCheckEntries()
                },
                enabled = state.editable
            )
            DropdownMenuItem(
                text = { Text("生成候选数") },
                onClick = {
                    menuOpen = false
                    onGenerateNotes()
                },
                enabled = state.editable && !state.notesPending
            )
            HorizontalDivider()
            DropdownMenuItem(
                text = { Text("放大检查棋盘") },
                onClick = {
                    menuOpen = false
                    zoomOpen = true
                },
                enabled = state.session != null
            )
            DropdownMenuItem(text = { Text("对局设置与规则") }, onClick = {
                menuOpen = false
                settingsOpen = true
            })
            DropdownMenuItem(
                text = { Text("重新开始本题") },
                onClick = {
                    menuOpen = false
                    restartOpen = true
                },
                enabled = state.session != null && state.phase != GamePhase.PREPARING
            )
            DropdownMenuItem(
                text = { Text(if (state.session?.mode == GameMode.DAILY) "选择其他挑战" else "返回选择") },
                onClick = {
                    menuOpen = false
                    onLeave()
                }
            )
        }
    }

    Scaffold(
        modifier = Modifier.fillMaxSize()
            .then(if (departing) Modifier.clearAndSetSemantics {} else Modifier)
            .pointerInput(departing) {
                if (departing) {
                    awaitPointerEventScope {
                        while (true) {
                            awaitPointerEvent(PointerEventPass.Initial).changes.forEach { it.consume() }
                        }
                    }
                }
            }.onPreviewKeyEvent { event ->
                if (modalOpen || !state.editable || event.type != KeyEventType.KeyDown) {
                    return@onPreviewKeyEvent false
                }
                handleGameKey(
                    event,
                    onEnterDigit = onEnterDigit,
                    onUndo = onUndo,
                    onRedo = onRedo,
                    onErase = onErase,
                    onToggleNotes = onToggleNotes
                )
            },
        topBar = {
            CenterAlignedTopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                    navigationIconContentColor = MaterialTheme.colorScheme.onSurface,
                    actionIconContentColor = MaterialTheme.colorScheme.onSurface
                ),
                navigationIcon = {
                    IconButton(onClick = { onLeave() }) {
                        Icon(
                            Icons.AutoMirrored.Outlined.ArrowBack,
                            "暂停保存并返回"
                        )
                    }
                },

                title = {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            state.session?.let { variantLabel(it.puzzle.rules.variant) } ?: "数独",
                            style = MaterialTheme.typography.titleMedium
                        )
                        state.session?.let {
                            Text(
                                difficultyLabel(it.puzzle.difficulty),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                },
                actions = {
                    IconButton(onClick = onPause, enabled = state.editable) {
                        Icon(Icons.Outlined.Pause, "暂停")
                    }
                    IconButton(onClick = { settingsOpen = true }) {
                        Icon(Icons.Outlined.Settings, "对局设置与规则")
                    }
                }
            )
        }
    ) { padding ->
        BoxWithConstraints(Modifier.fillMaxSize().padding(padding)) {
            val availableHeight = maxHeight
            val boardHeightLimit = (availableHeight - 76.dp).coerceIn(144.dp, 620.dp)
            Column(
                Modifier.fillMaxWidth().verticalScroll(rememberScrollState())
                    .heightIn(min = availableHeight).padding(horizontal = 12.dp, vertical = 14.dp),
                // Split spare vertical space 40/60 so the group sits slightly above center.
                verticalArrangement = Arrangement.spacedBy(8.dp, BiasAlignment.Vertical(-0.2f)),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                if (state.session != null) {
                    state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    state.message?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
                BoxWithConstraints(Modifier.fillMaxWidth()) {
                    val expanded = maxWidth >= 600.dp
                    if (expanded) {
                        val boardSize = minOf((maxWidth - 24.dp) * 0.55f, boardHeightLimit)
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(24.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(Modifier.width(boardSize)) {
                                BoardStatus(state)
                                BoardWorkspace(
                                    state,
                                    onSelectCell,
                                    onResume,
                                    onCancelPreparation,
                                    onRetryPreparation,
                                    Modifier.fillMaxWidth()
                                )
                            }
                            GameInputPanel(
                                state = state,
                                onUndo = onUndo,
                                onRedo = onRedo,
                                onErase = onErase,
                                onToggleNotes = onToggleNotes,
                                onHint = onRequestHint,
                                onDigit = onEnterDigit,
                                onNote = onToggleNote,
                                onRetrySave = onRetrySave,
                                onMore = { menuOpen = true },
                                moreMenu = moreMenu,
                                modifier = Modifier.weight(1f)
                            )
                        }
                    } else {
                        Column(
                            Modifier.widthIn(max = 620.dp),
                            verticalArrangement = Arrangement.spacedBy(16.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Column {
                                BoardStatus(state)
                                BoardWorkspace(
                                    state,
                                    onSelectCell,
                                    onResume,
                                    onCancelPreparation,
                                    onRetryPreparation,
                                    Modifier.fillMaxWidth()
                                )
                            }
                            GameInputPanel(
                                state = state,
                                onUndo = onUndo,
                                onRedo = onRedo,
                                onErase = onErase,
                                onToggleNotes = onToggleNotes,
                                onHint = onRequestHint,
                                onDigit = onEnterDigit,
                                onNote = onToggleNote,
                                onRetrySave = onRetrySave,
                                onMore = { menuOpen = true },
                                moreMenu = moreMenu,
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                    }
                }
                if (state.phase == GamePhase.COMPLETED) {
                    Text("完成了！", style = MaterialTheme.typography.headlineMedium)
                    Text(
                        "用时 ${formatElapsedTime(state.elapsedMs)} · " +
                            "${if (state.session?.assistance?.assisted == true) "辅助完成" else "无辅助完成"}"
                    )
                    Button(onClick = { onRecords() }) { Text("查看记录") }
                }
            }
        }
    }

    if (state.practiceReplacement != null) {
        PracticeReplacementDialog(
            onCancel = {
                onCancelPracticeReplacement()
                onLeave()
            },
            onContinue = {
                onCancelPracticeReplacement()
                onResume()
            },
            onReplace = onConfirmPracticeReplacement
        )
    }

    if (settingsOpen) {
        GameSettingsDialog(state, onSetShowTimer, onSetHighlightConflicts, onDismiss = { settingsOpen = false })
    }
    if (restartOpen) {
        RestartConfirmation(
            onDismiss = { restartOpen = false },
            onConfirm = {
                restartOpen = false
                onRestart()
            }
        )
    }
    if (zoomOpen) {
        GameZoomDialog(
            state,
            onSelectCell,
            onResume,
            onCancelPreparation,
            onRetryPreparation,
            onEnterDigit,
            onDismiss = { zoomOpen = false }
        )
    }

    if (state.hint != null) {
        GameHintSheet(state, onDismissHint, onNextHint, onApplyHint)
    }
}
