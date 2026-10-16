package dev.yigeyinian.sudoku.game

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.view.KeyEvent as AndroidKeyEvent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.Backspace
import androidx.compose.material.icons.automirrored.outlined.Redo
import androidx.compose.material.icons.automirrored.outlined.Undo
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Lightbulb
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material.icons.outlined.ZoomIn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.yigeyinian.sudoku.design.InitialDialogFocus
import dev.yigeyinian.sudoku.designsystem.NumberPad
import dev.yigeyinian.sudoku.designsystem.SudokuBoard
import dev.yigeyinian.sudoku.designsystem.difficultyLabel
import dev.yigeyinian.sudoku.designsystem.formatElapsedTime
import dev.yigeyinian.sudoku.designsystem.variantLabel
import dev.yigeyinian.sudoku.model.GameLaunch
import dev.yigeyinian.sudoku.model.GameMode
import dev.yigeyinian.sudoku.model.SessionMetadata
import dev.yigeyinian.sudoku.model.variant
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GameRoute(launch: GameLaunch, onLeave: () -> Unit, onRecords: () -> Unit) {
    val model: GameViewModel = hiltViewModel()
    val state by model.uiState.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var menuOpen by remember { mutableStateOf(false) }
    var settingsOpen by remember { mutableStateOf(false) }
    var restartOpen by remember { mutableStateOf(false) }
    var zoomOpen by remember { mutableStateOf(false) }
    val modalOpen = menuOpen || settingsOpen || restartOpen || zoomOpen || state.hint != null ||
        state.practiceReplacement != null
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val activity = LocalContext.current.findActivity()

    LaunchedEffect(launch) { model.open(launch) }

    DisposableEffect(lifecycle, model, activity) {
        val observer = LifecycleEventObserver { _, event ->
            // Rotation retains the session; leaving the visible app settles its monotonic interval.
            if (event == Lifecycle.Event.ON_STOP && activity?.isChangingConfigurations != true) model.pause()
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }

    fun leave() {
        scope.launch { if (model.leave()) onLeave() }
    }

    BackHandler(enabled = !modalOpen) { leave() }

    val moreMenu: @Composable () -> Unit = {
        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
            Text("辅助工具 · 使用后记为辅助完成", Modifier.padding(16.dp), style = MaterialTheme.typography.labelMedium)
            DropdownMenuItem(
                text = { Text("检查填写") },
                onClick = {
                    menuOpen = false
                    model.checkEntries()
                },
                enabled = state.editable
            )
            DropdownMenuItem(
                text = { Text("生成候选数") },
                onClick = {
                    menuOpen = false
                    model.generateNotes()
                },
                enabled = state.editable && !state.notesPending
            )
            HorizontalDivider()
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
                    leave()
                }
            )
        }
    }

    Scaffold(
        modifier = Modifier.fillMaxSize().onPreviewKeyEvent { event ->
            if (modalOpen || !state.editable || event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
            val key = event.nativeKeyEvent
            when {
                key.keyCode == AndroidKeyEvent.KEYCODE_Z && (key.isCtrlPressed || key.isMetaPressed) -> {
                    if (key.isShiftPressed) model.redo() else model.undo()
                    true
                }
                key.isCtrlPressed || key.isMetaPressed || key.isAltPressed -> false
                key.keyCode in AndroidKeyEvent.KEYCODE_1..AndroidKeyEvent.KEYCODE_9 -> {
                    model.enterDigit(key.keyCode - AndroidKeyEvent.KEYCODE_1 + 1)
                    true
                }
                key.keyCode in AndroidKeyEvent.KEYCODE_NUMPAD_1..AndroidKeyEvent.KEYCODE_NUMPAD_9 -> {
                    model.enterDigit(key.keyCode - AndroidKeyEvent.KEYCODE_NUMPAD_1 + 1)
                    true
                }
                key.keyCode == AndroidKeyEvent.KEYCODE_DEL || key.keyCode == AndroidKeyEvent.KEYCODE_FORWARD_DEL -> {
                    model.erase()
                    true
                }
                key.keyCode == AndroidKeyEvent.KEYCODE_N -> {
                    model.toggleNotes()
                    true
                }
                else -> false
            }
        },
        topBar = {
            TopAppBar(
                navigationIcon = {
                    IconButton(onClick = ::leave) {
                        Icon(
                            Icons.AutoMirrored.Outlined.ArrowBack,
                            "暂停保存并返回"
                        )
                    }
                },

                title = {
                    Column {
                        Text(state.session?.let { variantLabel(it.puzzle.rules.variant) } ?: "数独")
                        state.session?.let {
                            Text(
                                difficultyLabel(it.puzzle.difficulty),
                                style = MaterialTheme.typography.labelMedium
                            )
                        }
                    }
                },
                actions = {
                    if (state.settings.showTimer) {
                        Text(
                            formatElapsedTime(state.elapsedMs),
                            style = MaterialTheme.typography.titleMedium
                        )
                    }
                    if (state.editable) IconButton(onClick = model::pause) { Icon(Icons.Outlined.Pause, "暂停") }
                }
            )
        }
    ) { padding ->
        BoxWithConstraints(Modifier.fillMaxSize().padding(padding)) {
            val dailyHeaderHeight = if (state.session?.metadata is SessionMetadata.Daily) 36.dp else 0.dp
            // Capture finite viewport height before scrolling removes the vertical constraint.
            val boardHeightLimit = (maxHeight - 104.dp - dailyHeaderHeight).coerceIn(240.dp, 620.dp)
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                state.session?.metadata?.let { metadata ->
                    if (metadata is SessionMetadata.Daily) {
                        Text(
                            "${metadata.challengeDate} · ${if (metadata.formalAttempt) "正式挑战" else "每日练习"}",
                            style = MaterialTheme.typography.labelLarge
                        )
                    }
                }
                if (state.phase == GamePhase.PREPARING) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        CircularProgressIndicator(Modifier.size(24.dp))
                        Text(
                            if (state.preparationCommitting) "正在保存新对局…" else "正在生成并验证唯一解…",
                            Modifier.weight(1f)
                        )
                        TextButton(onClick = model::cancelPreparation, enabled = !state.preparationCommitting) {
                            Text("取消")
                        }
                    }
                }
                state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                state.message?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                if (state.session == null && state.phase != GamePhase.PREPARING) {
                    Button(onClick = { model.startNew(launch) }) { Text("重试") }
                }
                BoxWithConstraints(Modifier.fillMaxWidth()) {
                    val expanded = maxWidth >= 720.dp
                    if (expanded) {
                        val boardSize = minOf((maxWidth - 24.dp) * 0.55f, boardHeightLimit)
                        Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                            BoardWorkspace(state, model::selectCell, model::resume, Modifier.width(boardSize))
                            GameInputPanel(state, model, { menuOpen = true }, moreMenu, Modifier.weight(1f))
                        }
                    } else {
                        Column(
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            BoardWorkspace(state, model::selectCell, model::resume, Modifier.fillMaxWidth())
                            GameInputPanel(state, model, { menuOpen = true }, moreMenu, Modifier.fillMaxWidth())
                        }
                    }
                }
                if (state.session != null) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            saveDescription(state.save),
                            Modifier.weight(1f),
                            style = MaterialTheme.typography.bodySmall
                        )
                        if (state.save.failure != null) TextButton(onClick = model::retrySave) { Text("重试保存") }
                        IconButton(onClick = { zoomOpen = true }) { Icon(Icons.Outlined.ZoomIn, "放大检查棋盘") }
                    }
                }
                if (state.phase == GamePhase.COMPLETED) {
                    Text("完成了！", style = MaterialTheme.typography.headlineMedium)
                    Text(
                        "用时 ${formatElapsedTime(state.elapsedMs)} · " +
                            "${if (state.session?.assistance?.assisted == true) "辅助完成" else "无辅助完成"}"
                    )
                    Button(onClick = { scope.launch { if (model.leave()) onRecords() } }) { Text("查看记录") }
                }
            }
        }
    }

    if (state.practiceReplacement != null) {
        PracticeReplacementDialog(
            onCancel = {
                model.cancelPracticeReplacement()
                leave()
            },
            onContinue = {
                model.cancelPracticeReplacement()
                model.resume()
            },
            onReplace = model::confirmPracticeReplacement
        )
    }

    if (settingsOpen) {
        AlertDialog(
            onDismissRequest = { settingsOpen = false },
            title = { Text("对局设置与规则") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    SettingSwitch("显示计时", state.settings.showTimer, model::setShowTimer)
                    SettingSwitch("标记规则冲突", state.settings.highlightConflicts, model::setHighlightConflicts)
                    Text("隐藏计时不会停止计时。检查、候选数和逻辑提示会永久记为辅助使用。")
                    state.session?.let { Text(ruleDescription(it.puzzle.rules)) }
                    Text("切到后台自动暂停，返回后需手动继续。每日挑战按北京时间计算。")
                }
            },
            confirmButton = { TextButton(onClick = { settingsOpen = false }) { Text("关闭") } }
        )
    }
    if (restartOpen) {
        RestartConfirmation(
            onDismiss = { restartOpen = false },
            onConfirm = {
                restartOpen = false
                model.restart()
            }
        )
    }
    if (zoomOpen) {
        Dialog(
            onDismissRequest = { zoomOpen = false },
            properties = DialogProperties(usePlatformDefaultWidth = false)
        ) {
            androidx.compose.material3.Surface(shape = MaterialTheme.shapes.large) {
                Column(
                    Modifier.padding(16.dp).verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text("检查棋盘", style = MaterialTheme.typography.titleLarge)
                    Box(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())) {
                        BoardWorkspace(state, model::selectCell, model::resume, Modifier.width(540.dp))
                    }
                    Text(selectedDescription(state))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = {
                            model.selectCell(((state.selectedCell ?: 0) + 80) % 81)
                        }) { Text("上一格") }
                        OutlinedButton(onClick = {
                            model.selectCell(((state.selectedCell ?: 0) + 1) % 81)
                        }) { Text("下一格") }
                    }
                    NumberPad(state.inputEditable, state.noteMode, model::enterDigit)
                    TextButton(onClick = { zoomOpen = false }) { Text("关闭") }
                }
            }
        }
    }

    val hint = state.hint
    if (hint != null) {
        ModalBottomSheet(onDismissRequest = model::dismissHint) {
            Column(
                Modifier.padding(24.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text("逻辑提示", style = MaterialTheme.typography.titleLarge)
                Text("第 ${state.hintStep + 1} / ${hint.steps.size} 步 · 已计入辅助使用")
                hint.steps.getOrNull(state.hintStep)?.let { Text(explainStep(it)) }
                if (state.hintStep < hint.steps.lastIndex) {
                    Button(onClick = model::nextHint) { Text("下一步推理") }
                } else {
                    Button(onClick = model::applyHint) {
                        Text(
                            "应用：第 ${hint.placement.cell / 9 + 1} 行" +
                                "第 ${hint.placement.cell % 9 + 1} 列填 ${hint.placement.digit}"
                        )
                    }
                }
                TextButton(onClick = model::dismissHint) { Text("关闭提示") }
            }
        }
    }
}

@Composable
private fun BoardWorkspace(state: GameUiState, onSelect: (Int) -> Unit, onResume: () -> Unit, modifier: Modifier) {
    val session = state.session ?: return
    Box(modifier.widthIn(max = 620.dp), contentAlignment = Alignment.Center) {
        if (state.phase == GamePhase.PAUSED || state.phase == GamePhase.PREPARING) {
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
private fun GameInputPanel(
    state: GameUiState,
    model: GameViewModel,
    onMore: () -> Unit,
    moreMenu: @Composable () -> Unit,
    modifier: Modifier
) {
    Column(modifier.widthIn(max = 620.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(selectedDescription(state), style = MaterialTheme.typography.bodySmall)
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val columns = if (maxWidth >= 288.dp && LocalDensity.current.fontScale <= 1.3f) {
                6
            } else {
                3
            }
            FlowRow(
                Modifier.fillMaxWidth(),
                maxItemsInEachRow = columns,
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Tool(
                    "撤销",
                    Icons.AutoMirrored.Outlined.Undo,
                    state.editable && state.session?.undoStack?.isNotEmpty() == true,
                    Modifier.weight(1f),
                    model::undo
                )
                Tool(
                    "重做",
                    Icons.AutoMirrored.Outlined.Redo,
                    state.editable && state.session?.redoStack?.isNotEmpty() == true,
                    Modifier.weight(1f),
                    model::redo
                )
                Tool(
                    "擦除",
                    Icons.AutoMirrored.Outlined.Backspace,
                    state.inputEditable,
                    Modifier.weight(1f),
                    model::erase
                )
                Tool(
                    if (state.noteMode) "笔记开" else "笔记",
                    Icons.Outlined.Edit,
                    state.editable,
                    Modifier.weight(1f),
                    model::toggleNotes
                )
                Tool(
                    "提示",
                    Icons.Outlined.Lightbulb,
                    state.editable && !state.hintPending,
                    Modifier.weight(1f),
                    model::requestHint
                )
                Box(Modifier.weight(1f)) {
                    Tool("更多", Icons.Outlined.MoreHoriz, state.session != null, Modifier.fillMaxWidth(), onMore)
                    moreMenu()
                }
            }
        }
        NumberPad(state.inputEditable, state.noteMode, model::enterDigit)
        if (state.conflictPending) Text("正在检查当前棋盘规则…", style = MaterialTheme.typography.bodySmall)
        if (state.notesPending) Text("正在生成候选数；继续填写会取消本次计算。", style = MaterialTheme.typography.bodySmall)
        if (state.hintPending) Text("正在寻找可验证的逻辑推理…", style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun Tool(label: String, icon: ImageVector, enabled: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        FilledTonalIconButton(
            onClick = onClick,
            enabled = enabled,
            modifier = Modifier.size(48.dp)
        ) {
            Icon(
                icon,
                label
            )
        }
        Text(label, style = MaterialTheme.typography.labelSmall)
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
private fun PracticeReplacementDialog(onCancel: () -> Unit, onContinue: () -> Unit, onReplace: () -> Unit) {
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
private fun RestartConfirmation(onDismiss: () -> Unit, onConfirm: () -> Unit) {
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

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

private fun selectedDescription(state: GameUiState): String {
    val cell = state.selectedCell ?: return "先选择一个空格，再输入数字。"
    val position = "第 ${cell / 9 + 1} 行第 ${cell % 9 + 1} 列"
    if (state.session?.puzzle?.givens?.get(cell) != 0) return "$position · 题目给定，不能修改"
    return "$position · ${if (state.noteMode) "候选笔记模式" else "数字输入模式"}"
}

private fun saveDescription(save: SaveState): String = when {
    save.failure != null -> "保存失败，当前进度仍保留在本次对局：${save.failure.message}"
    save.saving -> "正在保存…"
    save.dirty -> "有未保存进度"
    else -> "进度已保存到本机"
}
