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
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

internal data class RecordsUiState(
    val loading: Boolean = true,
    val busy: Boolean = false,
    val variant: Variant = Variant.CLASSIC,
    val items: List<dev.yigeyinian.sudoku.model.SummaryItem> = emptyList(),
    val next: dev.yigeyinian.sudoku.model.SummaryCursor? = null,
    val pending: Boolean = false,
    val summary: RecordSummary? = null,
    val tab: RecordsTab = RecordsTab.OVERVIEW,
    val epoch: Long? = null,
    val quarantined: Int = 0,
    val preview: BackupPreview? = null,
    val error: String? = null,
    val notice: String? = null,
    val replacementGeneration: Long = 0
)

internal enum class RecordsTab(val label: String) { OVERVIEW("概览"), SAVES("本地存档"), HISTORY("完成历史") }

@HiltViewModel
internal class RecordsViewModel @Inject constructor(
    private val repository: GameRepository,
    private val reads: dev.yigeyinian.sudoku.model.GameReadRepository
) : ViewModel() {
    private val mutableState = MutableStateFlow(RecordsUiState())
    val uiState = mutableState.asStateFlow()
    var pendingExport: BackupExport? = null
        private set
    private var operationGeneration = 0L
    private var readJob: kotlinx.coroutines.Job? = null
    private var retryOperation: (suspend () -> Unit)? = null

    fun refresh() {
        if (mutableState.value.busy) {
            return
        }
        readJob?.cancel()
        readJob = viewModelScope.launch { load() }
    }

    fun selectVariant(variant: Variant) {
        if (variant != mutableState.value.variant) {
            mutableState.update {
                it.copy(variant = variant, epoch = null, items = emptyList(), next = null, summary = null)
            }
            refresh()
        }
    }

    fun selectTab(tab: RecordsTab) {
        if (tab != mutableState.value.tab) {
            mutableState.update { it.copy(tab = tab, epoch = null, items = emptyList(), next = null, summary = null) }
            refresh()
        }
    }

    @OptIn(kotlinx.coroutines.FlowPreview::class)
    suspend fun observe() {
        reads.changes.debounce(100).collect { refresh() }
    }

    fun loadMore() {
        if (mutableState.value.next != null && !mutableState.value.loading) {
            readJob = viewModelScope.launch { load(more = true) }
        }
    }

    fun openBackup() {
        viewModelScope.launch {
            when (val result = repository.countQuarantined()) {
                is StorageOutcome.Success -> mutableState.update { it.copy(quarantined = result.value) }
                is StorageOutcome.Failure -> mutableState.update { it.copy(error = "隔离记录暂时无法读取，请重试。") }
            }
        }
    }

    fun retry() {
        if (mutableState.value.busy) {
            return
        }
        val retry = retryOperation
        if (retry != null) {
            viewModelScope.launch { retry() }
        } else if (mutableState.value.pending) {
            repairPending()
        } else {
            refresh()
        }
    }

    private fun repairPending() {
        viewModelScope.launch {
            perform("整理记录失败", retry = { repairPending() }) {
                reads.backfill().requireSuccess()
                load()
            }
        }
    }

    private suspend fun load(more: Boolean = false) {
        val generation = ++operationGeneration
        mutableState.update { it.copy(loading = true, error = null) }
        try {
            val before = mutableState.value
            val overview = if (before.tab == RecordsTab.OVERVIEW) {
                reads.readOverview(before.variant, challengeDate(Instant.now())).requireSuccess()
            } else {
                null
            }
            var append = more
            val page = if (before.tab != RecordsTab.OVERVIEW) {
                val outcome = reads.readPage(
                    before.variant,
                    results = before.tab == RecordsTab.HISTORY,
                    cursor = if (more) before.next else null
                )
                if (outcome is StorageOutcome.Failure && outcome.error.kind == StorageFailureKind.REVISION_CONFLICT) {
                    append = false
                    reads.readPage(before.variant, results = before.tab == RecordsTab.HISTORY).requireSuccess()
                } else {
                    outcome.requireSuccess()
                }
            } else {
                null
            }
            val epoch = overview?.epoch ?: checkNotNull(page).epoch
            check(repository.readDatasetEpoch().requireSuccess() == epoch) { "读取期间本机数据已变化，请重新读取。" }
            if (generation == operationGeneration) {
                mutableState.update {
                    it.copy(
                        loading = false,
                        epoch = epoch,
                        summary = overview?.summary,
                        pending = overview?.pending ?: checkNotNull(page).pending,
                        items = ((if (append) before.items else emptyList()) + page?.items.orEmpty()).takeLast(120),
                        next = page?.next,
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
                        epoch = null,
                        items = emptyList(),
                        next = null,
                        summary = null,
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
                        epoch = null,
                        items = emptyList(),
                        next = null,
                        summary = null,
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
                mutableState.update { it.copy(notice = "隔离记录已清理。", quarantined = 0) }
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
