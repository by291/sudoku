package dev.yigeyinian.sudoku.feature.records

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.yigeyinian.sudoku.design.InitialDialogFocus
import dev.yigeyinian.sudoku.designsystem.difficultyLabel
import dev.yigeyinian.sudoku.designsystem.formatElapsedTime
import dev.yigeyinian.sudoku.designsystem.variantLabel
import dev.yigeyinian.sudoku.model.GameLaunch
import dev.yigeyinian.sudoku.model.GameMode
import dev.yigeyinian.sudoku.model.GameSession
import dev.yigeyinian.sudoku.model.Variant
import dev.yigeyinian.sudoku.model.variant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun RecordsRoute(onResume: (GameLaunch) -> Unit, onDatasetReplaced: () -> Unit) {
    val model: RecordsViewModel = hiltViewModel()
    val state by model.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var documentLoading by remember { mutableStateOf(false) }
    var deliveredReplacement by rememberSaveable { mutableStateOf(0L) }
    val createDocument =
        rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
            val export = model.pendingExport
            if (uri == null) {
                model.finishExport(null)
            } else if (export == null) {
                model.documentFailure("导出已中断，请重新导出备份。")
            } else {
                scope.launch {
                    try {
                        withContext(Dispatchers.IO) {
                            val stream = context.contentResolver.openOutputStream(uri, "wt") ?: error("无法打开所选文件。")
                            // Success is published only after the provider flushes and closes the stream.
                            stream.use { output ->
                                output.write(export.text.toByteArray(Charsets.UTF_8))
                                output.flush()
                            }
                        }
                        model.finishExport(export)
                    } catch (error: CancellationException) {
                        model.finishExport(null)
                        throw error
                    } catch (error: Exception) {
                        model.finishExport(null, "写入备份失败：${error.message.orEmpty()}。可重新选择位置导出。")
                    }
                }
            }
        }
    val openDocument = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            scope.launch {
                documentLoading = true
                try {
                    val text = withContext(Dispatchers.IO) {
                        val input = context.contentResolver.openInputStream(uri) ?: error("无法读取所选文件。")
                        input.use(::readBackupDocument)
                    }
                    model.previewImport(text)
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Exception) {
                    model.documentFailure("读取备份失败：${error.message.orEmpty()}。可重新选择文件。")
                } finally {
                    documentLoading = false
                }
            }
        }
    }

    LaunchedEffect(model) { model.refresh() }
    LaunchedEffect(state.replacementGeneration) {
        if (state.replacementGeneration > deliveredReplacement) {
            deliveredReplacement = state.replacementGeneration
            onDatasetReplaced()
        }
    }

    RecordsScreen(
        state = state.copy(busy = state.busy || documentLoading),
        onVariant = model::selectVariant,
        onResume = { onResume(GameLaunch.Resume(it)) },
        onRetry = model::retry,
        onExport = {
            scope.launch {
                val exported = model.prepareExport()
                if (exported != null) {
                    createDocument.launch("一格一念数独-${exported.backup.exportedAt.take(10)}.json")
                }
            }
        },
        onImport = { openDocument.launch(arrayOf("application/json", "text/plain", "application/octet-stream")) },
        onDismissPreview = model::dismissPreview,
        onRestore = model::confirmRestore,
        onClear = model::clearAll,
        onCleanup = model::removeQuarantined
    )
}

@Composable
internal fun RecordsScreen(
    state: RecordsUiState,
    onVariant: (Variant) -> Unit,
    onResume: (String) -> Unit,
    onRetry: () -> Unit,
    onExport: () -> Unit,
    onImport: () -> Unit,
    onDismissPreview: () -> Unit,
    onRestore: () -> Unit,
    onClear: () -> Unit,
    onCleanup: () -> Unit
) {
    var clearConfirmation by rememberSaveable { mutableStateOf(false) }
    var cleanupConfirmation by rememberSaveable { mutableStateOf(false) }
    val available = !state.loading && !state.busy && state.epoch != null
    val summary = state.summary
    val saved = state.sessions.filter { it.session.puzzle.rules.variant == state.variant }
    val completed = state.results.filter {
        it.session.puzzle.rules.variant == state.variant
    }.sortedByDescending { it.session.completion?.completedAt }

    LazyColumn(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 24.dp)
    ) {
        item {
            Text(
                "我的记录",
                style = MaterialTheme.typography.headlineLarge,
                modifier = Modifier.semantics { heading() }
            )
        }
        item { Text("每一次专注，都值得被记住。", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        item {
            Row(
                Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Variant.entries.forEach { variant ->
                    FilterChip(
                        selected = state.variant == variant,
                        onClick = { onVariant(variant) },
                        label = { Text(variantLabel(variant)) }
                    )
                }
            }
        }
        if (state.loading || state.busy) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    CircularProgressIndicator()
                    Text(if (state.loading) "正在读取记录…" else "正在处理，请稍候…")
                }
            }
        }
        if (state.error != null) {
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            state.error,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }
                        )
                        OutlinedButton(onClick = onRetry, enabled = !state.busy) { Text("重试") }
                    }
                }
            }
        }
        if (state.notice != null) {
            item { Text(state.notice, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        "自由游玩 · 最佳用时",
                        style = MaterialTheme.typography.titleLarge,
                        modifier = Modifier.semantics { heading() }
                    )
                    Text("未使用辅助 / 使用辅助", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    state.variant.difficulties.forEach { difficulty ->
                        val best = summary.freeBests.getValue(difficulty)
                        Text(
                            "${difficultyLabel(difficulty)}：${best.unassisted?.let(::formatElapsedTime) ?: "暂无"} / " +
                                "${best.assisted?.let(::formatElapsedTime) ?: "暂无"}"
                        )
                    }
                    HorizontalDivider()
                    Text("每日挑战 · 正式完成", style = MaterialTheme.typography.titleMedium)
                    Text("未使用辅助 ${summary.dailyTotals.unassisted} 局 · 使用辅助 ${summary.dailyTotals.assisted} 局")
                    Text("当前连续 ${summary.currentStreak} 天 · 最长连续 ${summary.longestStreak} 天")
                }
            }
        }
        item {
            Text(
                "本地存档",
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.semantics { heading() }
            )
        }
        if (saved.isEmpty()) item { Text("这个类型还没有存档。", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        items(
            saved,
            key = { "saved:${it.session.id}" }
        ) { record ->
            SessionRecordCard(
                record.session,
                if (record.session.completion == null) "继续对局" else "查看对局",
                available
            ) { onResume(record.session.id) }
        }
        item {
            Text(
                "完成历史",
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.semantics { heading() }
            )
        }
        if (completed.isEmpty()) {
            item {
                Text(
                    "完成第一局后，这里会留下你的记录。",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        items(
            completed,
            key = { "result:${it.session.id}" }
        ) { record ->
            SessionRecordCard(
                record.session,
                "查看完成记录",
                available
            ) { onResume(record.session.id) }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        "本地数据与备份",
                        style = MaterialTheme.typography.titleLarge,
                        modifier = Modifier.semantics { heading() }
                    )
                    Text(
                        "备份包含存档、完成记录、课程进度与设置，可在网页版与 Android 之间迁移。恢复会替换全部本机数据。",
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Button(
                        onClick = onExport,
                        enabled = available,
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("导出备份") }
                    OutlinedButton(
                        onClick = onImport,
                        enabled = available,
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("选择备份文件") }
                    if (state.quarantined > 0) {
                        Text("有 ${state.quarantined} 条无效记录已隔离，未包含在统计中。")
                        OutlinedButton(
                            onClick = { cleanupConfirmation = true },
                            enabled = available,
                            modifier = Modifier.fillMaxWidth()
                        ) { Text("清理隔离记录") }
                    }
                    TextButton(
                        onClick = { clearConfirmation = true },
                        enabled = available,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            "清空本机数据",
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                }
            }
        }
    }

    state.preview?.let { preview ->
        DestructiveConfirmation(
            title = "恢复备份",
            message = "导出时间：${preview.backup.exportedAt}\n" +
                "存档 ${preview.backup.sessions.size} 条 · 完成记录 ${preview.backup.results.size} 条 · " +
                "课程完成 ${preview.backup.lessons.size} 条\n\n" +
                "确认后将替换全部本机数据，此操作无法撤销。建议先导出当前备份。",

            confirmLabel = "确认替换本机数据",
            busy = state.busy,
            onDismiss = onDismissPreview,
            onConfirm = onRestore
        )
    }
    if (clearConfirmation) {
        DestructiveConfirmation(
            "清空本机数据",
            "将删除全部存档、完成记录、课程进度与设置，此操作无法撤销。",
            "确认清空",
            state.busy,
            { clearConfirmation = false },
            {
                clearConfirmation = false
                onClear()
            }
        )
    }
    if (cleanupConfirmation) {
        DestructiveConfirmation(
            "清理隔离记录",
            "将永久删除 ${state.quarantined} 条已隔离的无效记录。有效存档与完成记录不受影响。",
            "确认清理",
            state.busy,
            { cleanupConfirmation = false },
            {
                cleanupConfirmation = false
                onCleanup()
            }
        )
    }
}

@Composable
private fun SessionRecordCard(session: GameSession, action: String, enabled: Boolean, onClick: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            val mode = when (session.mode) {
                GameMode.FREE -> "自由游玩"
                GameMode.DAILY -> "每日挑战"
                GameMode.LEARNING -> "学习实战"
            }
            Text(
                "$mode · ${difficultyLabel(session.puzzle.difficulty)}",
                style = MaterialTheme.typography.titleMedium
            )
            Text("${formatElapsedTime(session.elapsedMs)} · ${if (session.assistance.assisted) "使用辅助" else "未使用辅助"}")
            Text(
                session.completion?.completedAt ?: session.startedAt,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            OutlinedButton(onClick = onClick, enabled = enabled) { Text(action) }
        }
    }
}

@Composable
private fun DestructiveConfirmation(
    title: String,
    message: String,
    confirmLabel: String,
    busy: Boolean,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit
) {
    val cancelFocus = remember { FocusRequester() }
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(title) },
        text = { Text(message) },
        confirmButton = {
            TextButton(
                onClick = onConfirm,
                enabled = !busy
            ) {
                Text(
                    confirmLabel,
                    color = MaterialTheme.colorScheme.error
                )
            }
        },

        dismissButton = {
            InitialDialogFocus(cancelFocus)
            TextButton(
                onClick = onDismiss,
                enabled = !busy,
                modifier = Modifier.focusRequester(cancelFocus).focusProperties { canFocus = !busy }
            ) { Text("取消") }
        }

    )
}
