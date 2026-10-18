package dev.sudoku.app.feature.records

import dev.sudoku.app.model.BackupExport
import dev.sudoku.app.model.BackupPreview
import dev.sudoku.app.model.GameRepository
import dev.sudoku.app.model.isoInstant
import java.time.Instant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

internal enum class BackupDocumentAction { EXPORT, IMPORT }

internal sealed interface BackupRetry {
    data object QuarantineCount : BackupRetry

    data class Preview(val text: String) : BackupRetry

    data class Restore(val preview: BackupPreview) : BackupRetry

    data class Clear(val epoch: Long) : BackupRetry

    data object Cleanup : BackupRetry

    data class Document(val action: BackupDocumentAction) : BackupRetry
}

internal data class RecordsBackupState(
    val busy: Boolean = false,
    val quarantined: Int = 0,
    val preview: BackupPreview? = null,
    val failure: RecordsFailure? = null,
    val retry: BackupRetry? = null,
    val notice: String? = null,
    val replacementGeneration: Long = 0
)

/** Owns backup business operations and the export/provider handshake; the route owns document I/O. */
internal class RecordsBackupController(
    private val repository: GameRepository,
    private val scope: CoroutineScope,
    private val onDatasetReplaced: () -> Unit,
    private val onRecordsChanged: () -> Unit
) {
    private val mutableState = MutableStateFlow(RecordsBackupState())
    val state = mutableState.asStateFlow()
    var pendingExport: BackupExport? = null
        private set
    private var countRead: Job? = null
    private var countGeneration = 0L

    fun open() {
        if (state.value.busy) {
            return
        }
        invalidateCount()
        val generation = countGeneration
        countRead = scope.launch {
            try {
                val count = repository.countQuarantined().requireRecordsSuccess()
                if (generation != countGeneration) {
                    return@launch
                }
                mutableState.update {
                    val retriedCount = it.retry == BackupRetry.QuarantineCount
                    it.copy(
                        quarantined = count,
                        failure = if (retriedCount) null else it.failure,
                        retry = if (retriedCount) null else it.retry
                    )
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                if (generation != countGeneration) {
                    return@launch
                }
                mutableState.update {
                    // Opening a panel is ancillary: its count failure cannot replace an
                    // explicit player operation's failure or captured document/restore retry.
                    if (it.retry != null && it.retry != BackupRetry.QuarantineCount) {
                        it
                    } else {
                        it.copy(
                            failure = error.recordsFailure("隔离记录暂时无法读取"),
                            retry = BackupRetry.QuarantineCount
                        )
                    }
                }
            }
        }
    }

    fun preview(text: String) = perform(BackupRetry.Preview(text), "备份解析失败") {
        val preview = repository.previewBackup(text).requireRecordsSuccess()
        mutableState.update { it.copy(preview = preview) }
    }

    fun dismissPreview() {
        if (!state.value.busy) {
            mutableState.update { it.copy(preview = null, failure = null, retry = null) }
        }
    }

    fun restore(preview: BackupPreview? = state.value.preview) {
        if (preview == null) {
            return
        }
        perform(BackupRetry.Restore(preview), "恢复备份失败") {
            repository.restoreBackup(preview).requireRecordsSuccess()
            replaced("备份已恢复，全部对局已暂停。")
        }
    }

    fun clear(epoch: Long) = perform(BackupRetry.Clear(epoch), "清空数据失败") {
        repository.clearAll(epoch).requireRecordsSuccess()
        replaced("本机数据已清空。")
    }

    fun cleanup() = perform(BackupRetry.Cleanup, "清理隔离记录失败") {
        repository.removeQuarantined().requireRecordsSuccess()
        mutableState.update { it.copy(notice = "隔离记录已清理。", quarantined = 0) }
        onRecordsChanged()
    }

    private fun replaced(notice: String) {
        mutableState.update {
            it.copy(preview = null, notice = notice, replacementGeneration = it.replacementGeneration + 1)
        }
        onDatasetReplaced()
    }

    /** Document retries require a fresh picker launch, never an automatic database read. */
    fun retry(): BackupDocumentAction? {
        if (state.value.busy) {
            return null
        }
        when (val retry = state.value.retry) {
            BackupRetry.QuarantineCount -> open()
            is BackupRetry.Preview -> preview(retry.text)
            is BackupRetry.Restore -> restore(retry.preview)
            is BackupRetry.Clear -> clear(retry.epoch)
            BackupRetry.Cleanup -> cleanup()
            is BackupRetry.Document -> return retry.action
            null -> Unit
        }
        return null
    }

    suspend fun prepareExport(): BackupExport? {
        if (state.value.busy) {
            return null
        }
        invalidateCount()
        mutableState.update { it.copy(busy = true, failure = null, retry = null, notice = null) }
        return try {
            repository.exportBackup(isoInstant(Instant.now())).requireRecordsSuccess().also { pendingExport = it }
        } catch (error: CancellationException) {
            mutableState.update { it.copy(busy = false) }
            throw error
        } catch (error: Exception) {
            mutableState.update {
                it.copy(
                    busy = false,
                    failure = error.recordsFailure("导出备份失败"),
                    retry = BackupRetry.Document(BackupDocumentAction.EXPORT)
                )
            }
            null
        }
    }

    fun finishExport(export: BackupExport?, error: String? = null) {
        // The prepared snapshot remains owned here until the provider has flushed and closed it.
        pendingExport = null
        mutableState.update {
            it.copy(
                busy = false,
                failure = error?.let(::RecordsFailure),
                retry = error?.let { BackupRetry.Document(BackupDocumentAction.EXPORT) },
                notice = if (export != null && error == null) {
                    "备份已导出。排除 ${export.excluded} 条无效记录，另有 ${export.quarantined} 条隔离记录。"
                } else {
                    null
                }
            )
        }
    }

    fun documentFailure(message: String, action: BackupDocumentAction) {
        invalidateCount()
        pendingExport = null
        mutableState.update {
            it.copy(
                busy = false,
                failure = RecordsFailure(message),
                retry = BackupRetry.Document(action),
                notice = null
            )
        }
    }

    private fun perform(retry: BackupRetry, prefix: String, operation: suspend () -> Unit) {
        if (state.value.busy) {
            return
        }
        invalidateCount()
        // Reserve the operation before launch so two clicks cannot start concurrent replacements.
        mutableState.update { it.copy(busy = true, failure = null, retry = null, notice = null) }
        scope.launch {
            try {
                operation()
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                mutableState.update { it.copy(failure = error.recordsFailure(prefix), retry = retry) }
            } finally {
                mutableState.update { it.copy(busy = false) }
            }
        }
    }

    private fun invalidateCount() {
        countRead?.cancel()
        // A provider/read may finish non-cancellably; an older count must not alter a newer operation.
        countGeneration++
    }
}
