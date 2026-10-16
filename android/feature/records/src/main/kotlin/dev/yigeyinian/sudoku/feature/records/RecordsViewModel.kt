package dev.yigeyinian.sudoku.feature.records

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.yigeyinian.sudoku.model.BackupExport
import dev.yigeyinian.sudoku.model.BackupPreview
import dev.yigeyinian.sudoku.model.GameRepository
import dev.yigeyinian.sudoku.model.RecordSummary
import dev.yigeyinian.sudoku.model.ResultRecord
import dev.yigeyinian.sudoku.model.SessionRecord
import dev.yigeyinian.sudoku.model.StorageFailureKind
import dev.yigeyinian.sudoku.model.StorageOutcome
import dev.yigeyinian.sudoku.model.Variant
import dev.yigeyinian.sudoku.model.challengeDate
import dev.yigeyinian.sudoku.model.isoInstant
import dev.yigeyinian.sudoku.model.summarizeRecords
import java.time.Instant
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

internal data class RecordsUiState(
    val loading: Boolean = true,
    val busy: Boolean = false,
    val variant: Variant = Variant.CLASSIC,
    val sessions: List<SessionRecord> = emptyList(),
    val results: List<ResultRecord> = emptyList(),
    val epoch: Long? = null,
    val quarantined: Int = 0,
    val preview: BackupPreview? = null,
    val error: String? = null,
    val notice: String? = null,
    val replacementGeneration: Long = 0
) {
    val summary: RecordSummary get() = summarizeRecords(results, challengeDate(Instant.now()), variant)
}

@HiltViewModel
internal class RecordsViewModel @Inject constructor(private val repository: GameRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(RecordsUiState())
    val uiState = mutableState.asStateFlow()
    var pendingExport: BackupExport? = null
        private set
    private var operationGeneration = 0L
    private var retryOperation: (suspend () -> Unit)? = null

    fun refresh() {
        if (mutableState.value.busy) {
            return
        }
        viewModelScope.launch { load() }
    }

    fun selectVariant(variant: Variant) = mutableState.update { it.copy(variant = variant) }

    fun retry() {
        if (mutableState.value.busy) {
            return
        }
        val retry = retryOperation
        if (retry == null) refresh() else viewModelScope.launch { retry() }
    }

    private suspend fun load() {
        val generation = ++operationGeneration
        mutableState.update { it.copy(loading = true, error = null) }
        try {
            val epoch = repository.readDatasetEpoch().requireSuccess()
            val sessions = repository.listSessions().requireSuccess()
            val results = repository.listResults().requireSuccess()
            val quarantined = repository.countQuarantined().requireSuccess()
            val currentEpoch = repository.readDatasetEpoch().requireSuccess()
            check(epoch == currentEpoch) { "读取期间本机数据已变化，请重新读取。" }
            if (generation == operationGeneration) {
                mutableState.update {
                    it.copy(
                        loading = false,
                        sessions = sessions,
                        results = results,
                        epoch = epoch,
                        quarantined = quarantined,
                        error = null
                    )
                }
                retryOperation = null
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            if (generation == operationGeneration) {
                mutableState.update { it.copy(loading = false, error = "读取记录失败：${error.message.orEmpty()}") }
                retryOperation = { load() }
            }
        }
    }

    suspend fun prepareExport(): BackupExport? {
        if (mutableState.value.busy || mutableState.value.loading) {
            return null
        }
        mutableState.update { it.copy(busy = true, error = null, notice = null) }
        return try {
            repository.exportBackup(isoInstant(Instant.now())).requireSuccess().also { pendingExport = it }
        } catch (error: CancellationException) {
            mutableState.update { it.copy(busy = false) }
            throw error
        } catch (error: Exception) {
            mutableState.update { it.copy(busy = false, error = "导出备份失败：${error.message.orEmpty()}") }
            null
        }
    }

    fun finishExport(export: BackupExport?, error: String? = null) {
        pendingExport = null
        mutableState.update {
            it.copy(
                busy = false,
                error = error,
                notice = if (export == null ||
                    error != null
                ) {
                    null
                } else {
                    "备份已导出。排除 ${export.excluded} 条无效记录，另有 ${export.quarantined} 条隔离记录。"
                }
            )
        }
    }

    fun documentFailure(message: String) {
        mutableState.update { it.copy(busy = false, error = message, notice = null) }
    }

    fun previewImport(text: String) {
        if (mutableState.value.busy) {
            return
        }
        viewModelScope.launch {
            perform("备份解析失败", retry = { previewImport(text) }) {
                val preview = repository.previewBackup(text).requireSuccess()
                mutableState.update { it.copy(preview = preview) }
            }
        }
    }

    fun dismissPreview() {
        if (!mutableState.value.busy) mutableState.update { it.copy(preview = null) }
    }

    fun confirmRestore() {
        val preview = mutableState.value.preview ?: return
        if (mutableState.value.busy) {
            return
        }
        viewModelScope.launch {
            perform("恢复备份失败", retry = { confirmRestore() }) {
                repository.restoreBackup(preview).requireSuccess()
                mutableState.update {
                    it.copy(
                        preview = null,
                        notice = "备份已恢复，全部对局已暂停。",
                        replacementGeneration =
                        it.replacementGeneration + 1
                    )
                }
                load()
            }
        }
    }

    fun clearAll() {
        val epoch = mutableState.value.epoch ?: return
        if (mutableState.value.busy) {
            return
        }
        viewModelScope.launch {
            perform("清空数据失败", retry = { clearAll() }) {
                repository.clearAll(epoch).requireSuccess()
                mutableState.update {
                    it.copy(
                        preview = null,
                        notice = "本机数据已清空。",
                        replacementGeneration =
                        it.replacementGeneration + 1
                    )
                }
                load()
            }
        }
    }

    fun removeQuarantined() {
        if (mutableState.value.busy) {
            return
        }
        viewModelScope.launch {
            perform("清理隔离记录失败", retry = { removeQuarantined() }) {
                repository.removeQuarantined().requireSuccess()
                mutableState.update { it.copy(notice = "隔离记录已清理。") }
                load()
            }
        }
    }

    private suspend fun perform(prefix: String, retry: suspend () -> Unit, operation: suspend () -> Unit) {
        mutableState.update { it.copy(busy = true, error = null, notice = null) }
        try {
            operation()
            retryOperation = null
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            mutableState.update { it.copy(error = "$prefix：${error.message.orEmpty()}") }
            retryOperation = retry
        } finally {
            mutableState.update { it.copy(busy = false) }
        }
    }
}

private fun <T> StorageOutcome<T>.requireSuccess(): T = when (this) {
    is StorageOutcome.Success -> value
    is StorageOutcome.Failure -> throw IllegalStateException(
        when (error.kind) {
            StorageFailureKind.UNAVAILABLE -> "存储或计算服务暂时不可用，请重试。"
            StorageFailureKind.WRITE_FAILED -> "无法写入本机数据，请重试。"
            StorageFailureKind.OWNERSHIP_LOST -> "对局编辑权限已变化，请重新读取。"
            StorageFailureKind.REVISION_CONFLICT -> "本机数据已变化，请重新读取并再次确认。"
            StorageFailureKind.INVALID_DATA -> "数据格式或内容无效，请检查备份文件。"
        }
    )
}
