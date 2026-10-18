package dev.sudoku.app.feature.records

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.sudoku.app.model.BackupPreview
import dev.sudoku.app.model.GameReadRepository
import dev.sudoku.app.model.GameRepository
import dev.sudoku.app.model.RecordSummary
import dev.sudoku.app.model.SummaryCursor
import dev.sudoku.app.model.SummaryItem
import dev.sudoku.app.model.Variant
import dev.sudoku.app.model.challengeDate
import dev.sudoku.app.model.challengeRefreshDelay
import java.time.Instant
import javax.inject.Inject
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.launch

internal data class RecordsUiState(
    val loading: Boolean = true,
    val busy: Boolean = false,
    val variant: Variant = Variant.CLASSIC,
    val items: List<SummaryItem> = emptyList(),
    val next: SummaryCursor? = null,
    val pending: Boolean = false,
    val summary: RecordSummary? = null,
    val tab: RecordsTab = RecordsTab.OVERVIEW,
    val epoch: Long? = null,
    val quarantined: Int = 0,
    val preview: BackupPreview? = null,
    val notice: String? = null,
    val replacementGeneration: Long = 0,
    val queryFailure: RecordsFailure? = null,
    val backupFailure: RecordsFailure? = null
) {
    val error get() = backupFailure?.message ?: queryFailure?.message
}

internal enum class RecordsTab(val label: String) { OVERVIEW("概览"), SAVES("本地存档"), HISTORY("完成历史") }

/** Coordinates independent query and backup owners without sharing their failures or retry identity. */
@HiltViewModel
internal class RecordsViewModel @Inject constructor(
    repository: GameRepository,
    private val reads: GameReadRepository,
    private val savedState: SavedStateHandle
) : ViewModel() {
    private val query = RecordsQueryController(
        repository,
        reads,
        viewModelScope,
        RecordsQueryState(
            variant = Variant.entries.firstOrNull { it.name == savedState.get<String>(VARIANT_KEY) } ?: Variant.CLASSIC,
            tab = RecordsTab.entries.firstOrNull { it.name == savedState.get<String>(TAB_KEY) } ?: RecordsTab.OVERVIEW
        )
    )
    private val backup = RecordsBackupController(
        repository,
        viewModelScope,
        onDatasetReplaced = {
            query.invalidate()
            query.refresh()
        },
        onRecordsChanged = { query.refresh() }
    )
    private val mutableState = MutableStateFlow(composedState(query.state.value, backup.state.value))
    val uiState = mutableState.asStateFlow()
    val pendingExport get() = backup.pendingExport

    init {
        viewModelScope.launch {
            combine(query.state, backup.state, ::composedState).collect { mutableState.value = it }
        }
    }

    fun refresh() = query.refresh()

    fun selectVariant(variant: Variant) {
        savedState[VARIANT_KEY] = variant.name
        query.select(variant = variant)
    }

    fun selectTab(tab: RecordsTab) {
        savedState[TAB_KEY] = tab.name
        query.select(tab = tab)
    }

    /** Run inside repeatOnLifecycle(STARTED); the initial Room emission performs the return refresh. */
    @OptIn(kotlinx.coroutines.FlowPreview::class)
    suspend fun observe() = coroutineScope {
        launch { reads.changes.debounce(100).collect { refresh() } }
        var date = challengeDate(Instant.now())
        while (true) {
            delay(challengeRefreshDelay(Instant.now()))
            val today = challengeDate(Instant.now())
            if (today != date) {
                date = today
                if (query.state.value.tab == RecordsTab.OVERVIEW) {
                    refresh()
                }
            }
        }
    }

    fun loadMore() = query.refresh(more = true)

    fun retryQuery() = query.retry()

    fun retryBackup(): BackupDocumentAction? = backup.retry()

    fun openBackup() = backup.open()

    suspend fun prepareExport() = backup.prepareExport()

    fun finishExport(export: dev.sudoku.app.model.BackupExport?, error: String? = null) =
        backup.finishExport(export, error)

    fun documentFailure(message: String, action: BackupDocumentAction = BackupDocumentAction.IMPORT) =
        backup.documentFailure(message, action)

    fun previewImport(text: String) = backup.preview(text)

    fun dismissPreview() = backup.dismissPreview()

    fun confirmRestore() = backup.restore()

    fun clearAll() {
        query.state.value.epoch?.let { backup.clear(it) }
    }

    fun removeQuarantined() = backup.cleanup()
}

private fun composedState(query: RecordsQueryState, backup: RecordsBackupState) = RecordsUiState(
    loading = query.loading,
    busy = backup.busy,
    variant = query.variant,
    items = query.items,
    next = query.next,
    pending = query.pending,
    summary = query.summary,
    tab = query.tab,
    epoch = query.epoch,
    quarantined = backup.quarantined,
    preview = backup.preview,
    notice = backup.notice,
    replacementGeneration = backup.replacementGeneration,
    queryFailure = query.failure,
    backupFailure = backup.failure
)

private const val VARIANT_KEY = "records.variant"
private const val TAB_KEY = "records.tab"
