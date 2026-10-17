package dev.yigeyinian.sudoku.feature.records

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.FileDownload
import androidx.compose.material.icons.outlined.FileUpload
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import dev.yigeyinian.sudoku.design.InitialDialogFocus
import dev.yigeyinian.sudoku.design.rememberDelayedProgress

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun RecordsBackup(
    state: RecordsUiState,
    open: Boolean,
    available: Boolean,
    onDismiss: () -> Unit,
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
    val closeFocus = remember { FocusRequester() }
    val pending = state.busy || state.loading
    val showProgress = rememberDelayedProgress(pending)
    if (open && !clearConfirmation && !cleanupConfirmation && state.preview == null) {
        ModalBottomSheet(
            onDismissRequest = onDismiss,
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = MaterialTheme.colorScheme.background,
            sheetMaxWidth = 480.dp,
            dragHandle = null
        ) {
            Box(
                Modifier.align(Alignment.CenterHorizontally).padding(top = 10.dp, bottom = 4.dp)
                    .size(32.dp, 4.dp)
                    .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.35f), RoundedCornerShape(2.dp))
            )
            InitialDialogFocus(closeFocus)
            Column(
                Modifier.verticalScroll(rememberScrollState()).padding(start = 20.dp, end = 20.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("本地数据与备份", Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
                    IconButton(onClick = onDismiss, modifier = Modifier.focusRequester(closeFocus)) {
                        Icon(Icons.Outlined.Close, "关闭备份面板")
                    }
                }
                Text(
                    "存档、完成记录、课程进度与设置，都可以在 Android 和网页版之间迁移。",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                RecordStatus(state, onRetry)
                if (showProgress) {
                    RecordCaption("正在处理，请稍候…")
                }
                Surface(
                    shape = RoundedCornerShape(18.dp),
                    color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.onSurface.copy(alpha = 0.1f))
                ) {
                    Column {
                        BackupAction("导出备份", "将当前数据保存为文件", Icons.Outlined.FileUpload, available, onExport)
                        HorizontalDivider(color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))
                        BackupAction("从备份恢复", "选择文件，确认后替换本机数据", Icons.Outlined.FileDownload, available, onImport)
                    }
                }
                Text(
                    "恢复会替换全部本机数据，建议先导出备份。",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (state.quarantined > 0) {
                    Text("有 ${state.quarantined} 条无效记录已隔离，未包含在统计中。", style = MaterialTheme.typography.bodySmall)
                    OutlinedButton(onClick = { cleanupConfirmation = true }, enabled = available) { Text("清理隔离记录") }
                }
                TextButton(onClick = { clearConfirmation = true }, enabled = available) {
                    Text("清空本机数据", color = MaterialTheme.colorScheme.error)
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
                "确认后将替换全部本机数据，此操作无法撤销。建议先导出当前备份。" +
                (state.error?.let { "\n\n$it" } ?: ""),
            confirmLabel = "确认替换本机数据",
            busy = pending,
            onDismiss = onDismissPreview,
            onConfirm = onRestore
        )
    }
    if (clearConfirmation) {
        DestructiveConfirmation(
            "清空本机数据",
            "将删除全部存档、完成记录、课程进度与设置，此操作无法撤销。",
            "确认清空",
            pending,
            { clearConfirmation = false },
            {
                clearConfirmation = false
                onDismiss()
                onClear()
            }
        )
    }
    if (cleanupConfirmation) {
        DestructiveConfirmation(
            "清理隔离记录",
            "将永久删除 ${state.quarantined} 条已隔离的无效记录。有效存档与完成记录不受影响。",
            "确认清理",
            pending,
            { cleanupConfirmation = false },
            {
                cleanupConfirmation = false
                onCleanup()
            }
        )
    }
}

@Composable
private fun BackupAction(title: String, subtitle: String, icon: ImageVector, enabled: Boolean, onClick: () -> Unit) {
    Surface(onClick = onClick, enabled = enabled, color = MaterialTheme.colorScheme.surface) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 80.dp).padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(icon, null, Modifier.size(24.dp), tint = MaterialTheme.colorScheme.primary)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(title, style = MaterialTheme.typography.titleSmall)
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Icon(
                Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                null,
                Modifier.size(20.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
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
