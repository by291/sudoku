package dev.yigeyinian.sudoku.feature.records

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.yigeyinian.sudoku.model.GameLaunch
import dev.yigeyinian.sudoku.model.challengeDate
import dev.yigeyinian.sudoku.model.challengeRefreshDelay
import java.time.Instant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun RecordsRoute(
    onResume: (GameLaunch) -> Unit,
    onDatasetReplaced: () -> Unit,
    backupOpen: Boolean = false,
    onDismissBackup: () -> Unit = {}
) {
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

    LaunchedEffect(model) { model.observe() }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { model.refresh() }
    LaunchedEffect(model) {
        var date = challengeDate(Instant.now())
        while (true) {
            delay(challengeRefreshDelay(Instant.now()))
            val today = challengeDate(Instant.now())
            if (today != date) {
                date = today
                model.refresh()
            }
        }
    }
    LaunchedEffect(backupOpen) { if (backupOpen) model.openBackup() }
    LaunchedEffect(state.replacementGeneration) {
        if (state.replacementGeneration > deliveredReplacement) {
            deliveredReplacement = state.replacementGeneration
            onDatasetReplaced()
        }
    }

    RecordsScreen(
        onTab = model::selectTab,
        onMore = model::loadMore,
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
        onCleanup = model::removeQuarantined,
        backupOpen = backupOpen,
        onDismissBackup = onDismissBackup
    )
}
