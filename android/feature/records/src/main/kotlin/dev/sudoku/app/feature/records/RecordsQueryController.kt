package dev.sudoku.app.feature.records

import dev.sudoku.app.model.GameReadRepository
import dev.sudoku.app.model.GameRepository
import dev.sudoku.app.model.RecordSummary
import dev.sudoku.app.model.StorageFailure
import dev.sudoku.app.model.StorageFailureKind
import dev.sudoku.app.model.StorageOutcome
import dev.sudoku.app.model.SummaryCursor
import dev.sudoku.app.model.SummaryItem
import dev.sudoku.app.model.SummaryPage
import dev.sudoku.app.model.SummaryQuery
import dev.sudoku.app.model.Variant
import dev.sudoku.app.model.challengeDate
import java.time.Instant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

private const val MAX_VISIBLE_RECORDS = 120

internal data class RecordsQueryState(
    val loading: Boolean = true,
    val variant: Variant = Variant.CLASSIC,
    val tab: RecordsTab = RecordsTab.OVERVIEW,
    val items: List<SummaryItem> = emptyList(),
    val next: SummaryCursor? = null,
    val pending: Boolean = false,
    val summary: RecordSummary? = null,
    val epoch: Long? = null,
    val failure: RecordsFailure? = null
)

internal data class RecordsFailure(val message: String, val storage: StorageFailure? = null)

/** Owns only the selected compact query and its pagination/repair retry. */
internal class RecordsQueryController(
    private val repository: GameRepository,
    private val reads: GameReadRepository,
    private val scope: CoroutineScope,
    initial: RecordsQueryState
) {
    private val mutableState = MutableStateFlow(initial)
    val state = mutableState.asStateFlow()
    private var generation = 0L
    private var job: Job? = null
    private var retryRepair = false

    fun select(variant: Variant = state.value.variant, tab: RecordsTab = state.value.tab) {
        if (variant == state.value.variant && tab == state.value.tab) {
            return
        }

        invalidate()
        mutableState.update { RecordsQueryState(variant = variant, tab = tab) }
        refresh()
    }

    fun invalidate() {
        job?.cancel()
        generation++
        retryRepair = false
        mutableState.update { RecordsQueryState(variant = it.variant, tab = it.tab) }
    }

    fun refresh(more: Boolean = false) {
        if (more && (state.value.next == null || state.value.loading)) {
            return
        }

        job?.cancel()
        val operation = ++generation
        job = scope.launch { load(operation, more) }
    }

    fun retry() {
        if (state.value.loading) {
            return
        }
        if (retryRepair || state.value.pending) {
            job?.cancel()
            val operation = ++generation
            job = scope.launch {
                mutableState.update { it.copy(loading = true, failure = null) }
                try {
                    reads.backfill().requireRecordsSuccess()
                    retryRepair = false
                    load(operation, more = false)
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Exception) {
                    if (operation == generation) {
                        retryRepair = true
                        mutableState.update {
                            it.copy(loading = false, failure = error.recordsFailure("整理记录失败"))
                        }
                    }
                }
            }
        } else {
            refresh()
        }
    }

    private suspend fun load(operation: Long, more: Boolean) {
        val before = state.value
        mutableState.update { it.copy(loading = true, failure = null) }
        try {
            val overview = if (before.tab == RecordsTab.OVERVIEW) {
                reads.readOverview(
                    before.variant,
                    challengeDate(Instant.now())
                ).requireRecordsSuccess()
            } else {
                null
            }
            val pageRead = if (overview == null) readPage(before, more = more) else null
            val page = pageRead?.page
            val epoch = overview?.epoch ?: checkNotNull(page).epoch

            val currentEpoch = repository.readDatasetEpoch()
            // A non-cancellable read can return after the active filter has changed.
            if (operation != generation) {
                return
            }
            if (currentEpoch.requireRecordsSuccess() != epoch) {
                val failure =
                    StorageFailure(StorageFailureKind.REVISION_CONFLICT, "Dataset changed")
                throw RecordsStorageException(failure)
            }

            val retained = if (pageRead?.isAppend == true) before.items else emptyList()
            val visible = (retained + page?.items.orEmpty()).takeLast(MAX_VISIBLE_RECORDS)
            mutableState.update {
                it.copy(
                    loading = false,
                    epoch = epoch,
                    summary = overview?.summary,
                    pending = overview?.pending ?: checkNotNull(page).pending,
                    items = visible,
                    next = page?.next,
                    failure = null
                )
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            if (operation == generation) {
                mutableState.update {
                    it.copy(loading = false, failure = error.recordsFailure("读取记录失败"))
                }
            }
        }
    }

    private data class PageRead(val page: SummaryPage, val isAppend: Boolean)

    private suspend fun readPage(before: RecordsQueryState, more: Boolean): PageRead {
        val query = when (before.tab) {
            RecordsTab.SAVES -> SummaryQuery.Saves(before.variant)
            RecordsTab.HISTORY -> SummaryQuery.History(before.variant)
            RecordsTab.OVERVIEW -> error("Overview has no summary page")
        }
        val outcome = reads.readPage(query, cursor = before.next.takeIf { more })

        // An expired cursor belongs to a different projection and cannot append to old rows.
        if (outcome is StorageOutcome.Failure &&
            outcome.error.kind == StorageFailureKind.REVISION_CONFLICT
        ) {
            return PageRead(reads.readPage(query).requireRecordsSuccess(), isAppend = false)
        }

        return PageRead(outcome.requireRecordsSuccess(), isAppend = more)
    }
}

internal class RecordsStorageException(val failure: StorageFailure) :
    IllegalStateException(failure.message)

internal fun <T> StorageOutcome<T>.requireRecordsSuccess(): T = when (this) {
    is StorageOutcome.Success -> value
    is StorageOutcome.Failure -> throw RecordsStorageException(error)
}

internal fun Exception.recordsFailure(prefix: String): RecordsFailure {
    val storage = (this as? RecordsStorageException)?.failure
    val detail = when (storage?.kind) {
        StorageFailureKind.UNAVAILABLE -> "存储或计算服务暂时不可用，请重试。"
        StorageFailureKind.WRITE_FAILED -> "无法写入本机数据，请重试。"
        StorageFailureKind.OWNERSHIP_LOST -> "对局编辑权限已变化，请重新读取。"
        StorageFailureKind.REVISION_CONFLICT -> "本机数据已变化，请重新读取并再次确认。"
        StorageFailureKind.INVALID_DATA -> "数据格式或内容无效，请检查备份文件。"
        null -> message.orEmpty()
    }
    return RecordsFailure("$prefix：$detail", storage)
}
