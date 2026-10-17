package dev.sudoku.app.game

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.sudoku.app.model.DailyStatus
import dev.sudoku.app.model.GameMode
import dev.sudoku.app.model.GameSummary
import dev.sudoku.app.model.StorageOutcome
import dev.sudoku.app.model.SummaryCursor
import dev.sudoku.app.model.SummaryItem
import dev.sudoku.app.model.Variant
import dev.sudoku.app.model.challengeDate
import java.time.Instant
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

internal data class GameEntryUiState(
    val epoch: Long? = null,
    val loading: Boolean = true,
    val hasLoadedSnapshot: Boolean = false,
    val hasSaves: Boolean = false,
    val singleSaveId: String? = null,
    val saves: List<SummaryItem> = emptyList(),
    val next: SummaryCursor? = null,
    val freeSave: GameSummary? = null,
    val freePending: Boolean = false,
    val daily: Map<Variant, DailyStatus> = emptyMap(),
    val sheetLoading: Boolean = false,
    val sheetError: String? = null,
    val today: String = challengeDate(Instant.now()),
    val error: String? = null
)

@HiltViewModel
internal class GameEntryViewModel @Inject constructor(private val loader: GameEntryLoader) : ViewModel() {
    val uiState = loader.uiState
    private var loading: Job? = null
    private var homeLoading: Job? = null
    private var generation = 0
    private var opened = false

    init {
        viewModelScope.launch {
            loader.repository.datasetEpochs.collect { epoch ->
                if (uiState.value.epoch != epoch) {
                    loading?.cancel()
                    generation++
                    loader.invalidate(epoch)
                    refresh()
                }
            }
        }
    }

    fun open() {
        if (opened || !uiState.value.hasLoadedSnapshot) refresh()
        opened = true
    }
    fun refresh() {
        homeLoading?.cancel()
        homeLoading = viewModelScope.launch { loader.prepareHome() }
    }

    fun loadSheet(daily: Boolean, variant: Variant) = sheet {
        if (daily) {
            val result = loader.reads.readDaily(challengeDate(Instant.now())).value()
            check(result.epoch == uiState.value.epoch)
            loader.update { it.copy(daily = result.statuses, today = result.date) }
        } else {
            val epoch = uiState.value.epoch
            var result = loader.reads.readSlotSummary(GameMode.FREE, variant).value()
            if (result != null && result.summary == null) {
                loader.reads.readSession(result.id).value()
                result = loader.reads.readSlotSummary(GameMode.FREE, variant).value()
            }
            check(loader.repository.readDatasetEpoch().value() == epoch && uiState.value.epoch == epoch)
            val resolved = result
            loader.update {
                it.copy(
                    freeSave = resolved?.summary,
                    freePending =
                    resolved != null && resolved.summary == null
                )
            }
        }
    }

    fun loadSaves(more: Boolean = false) = sheet {
        val before = uiState.value
        val outcome = loader.reads.readPage(unfinished = true, cursor = if (more) before.next else null)
        val stale =
            outcome is StorageOutcome.Failure &&
                outcome.error.kind == dev.sudoku.app.model.StorageFailureKind.REVISION_CONFLICT
        val page = (if (stale) loader.reads.readPage(unfinished = true) else outcome).value()
        check(page.epoch == uiState.value.epoch)
        loader.update {
            it.copy(
                saves = (
                    if (more &&
                        !stale
                    ) {
                        before.saves
                    } else {
                        emptyList()
                    }
                    ) + page.items,
                next = page.next
            )
        }
    }

    private fun sheet(operation: suspend () -> Unit) {
        loading?.cancel()
        val current = ++generation
        loader.update { it.copy(sheetLoading = true, sheetError = null) }
        loading = viewModelScope.launch {
            try {
                operation()
            } catch (error: kotlinx.coroutines.CancellationException) {
                throw error
            } catch (error: Exception) {
                if (generation == current) loader.update { it.copy(sheetError = "存档暂时无法读取，请重试。") }
            } finally {
                if (generation == current) loader.update { it.copy(sheetLoading = false) }
            }
        }
    }
}

private fun <T> StorageOutcome<T>.value(): T = when (this) {
    is StorageOutcome.Success -> value
    is StorageOutcome.Failure -> error(error.message)
}
