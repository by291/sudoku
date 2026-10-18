package dev.sudoku.app.game

import dev.sudoku.app.model.DailySnapshot
import dev.sudoku.app.model.GameMode
import dev.sudoku.app.model.GameReadRepository
import dev.sudoku.app.model.GameRepository
import dev.sudoku.app.model.GameSummary
import dev.sudoku.app.model.StorageFailure
import dev.sudoku.app.model.StorageFailureKind
import dev.sudoku.app.model.StorageOutcome
import dev.sudoku.app.model.SummaryCursor
import dev.sudoku.app.model.SummaryItem
import dev.sudoku.app.model.SummaryQuery
import dev.sudoku.app.model.Variant
import dev.sudoku.app.model.challengeDate
import java.time.Instant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Owns Home presence and one cancellable entry query, including all publication fences. */
internal class GameEntryController(
    private val reads: GameReadRepository,
    private val repository: GameRepository,
    private val scope: CoroutineScope,
    private val currentInstant: () -> Instant = Instant::now,
    restoredSheet: EntrySheet? = null,
    private val rememberSheet: (EntrySheet?) -> Unit = {}
) {
    private val initial = reads.bootstrap.value
    private val mutableState = MutableStateFlow(
        GameEntryUiState(
            epoch = initial?.epoch,
            sheet = restoredSheet,
            loading = initial == null,
            hasLoadedSnapshot = initial != null,
            singleSaveId = initial?.home?.singleSaveId,
            hasSaves = initial?.home?.let { it.hasSaves || it.pending } ?: false
        )
    )
    val uiState = mutableState.asStateFlow()
    private var homeJob: Job? = null
    private var sheetJob: Job? = null
    private var homeGeneration = 0L
    private var sheetGeneration = 0L
    private var observedEpoch = initial?.epoch
    private var opened = false

    init {
        scope.launch {
            repository.datasetEpochs.collect { epoch ->
                if (observedEpoch == null || epoch > checkNotNull(observedEpoch)) {
                    invalidate(epoch)
                    refresh()
                }
            }
        }
    }

    fun open() {
        if (opened || !uiState.value.hasLoadedSnapshot) {
            refresh()
        } else {
            refreshSheet()
        }
        opened = true
    }

    fun refresh() {
        homeJob?.cancel()
        homeJob = scope.launch {
            if (prepareHome() is StorageOutcome.Success) {
                refreshSheet()
            }
        }
    }

    fun showSetup(daily: Boolean) {
        selectSheet(if (daily) EntrySheet.Daily else EntrySheet.Setup(Variant.CLASSIC))
    }

    fun showContinue() {
        selectSheet(EntrySheet.Continue)
        loadSaves()
    }

    fun dismissSheet() {
        selectSheet(null)
    }

    private fun selectSheet(selection: EntrySheet?) {
        if (selection == uiState.value.sheet) {
            return
        }
        cancelSheet()
        rememberSheet(selection)
        update { it.copy(sheet = selection, sheetLoading = false, sheetError = null) }
    }

    private fun cancelSheet() {
        sheetGeneration++
        sheetJob?.cancel()
        sheetJob = null
    }

    fun invalidate(epoch: Long) {
        if (observedEpoch != null && epoch <= checkNotNull(observedEpoch)) {
            return
        }
        observedEpoch = epoch
        homeGeneration++
        homeJob?.cancel()
        cancelSheet()
        mutableState.value = GameEntryUiState(epoch = epoch, sheet = uiState.value.sheet)
    }

    suspend fun prepareHome(): StorageOutcome<Unit> {
        val operation = ++homeGeneration
        val result = reads.readBootstrap()
        // A completed query may have waited behind a newer refresh or dataset replacement.
        if (operation != homeGeneration || (
                result is StorageOutcome.Success &&
                    observedEpoch?.let { result.value.epoch < it } == true
                )
        ) {
            return StorageOutcome.Failure(StorageFailure(StorageFailureKind.REVISION_CONFLICT, "Home snapshot changed"))
        }

        return when (result) {
            is StorageOutcome.Success -> {
                val snapshot = result.value
                if (observedEpoch != snapshot.epoch) {
                    cancelSheet()
                    mutableState.value = GameEntryUiState(epoch = snapshot.epoch, sheet = uiState.value.sheet)
                }
                observedEpoch = snapshot.epoch
                update {
                    it.copy(
                        epoch = snapshot.epoch,
                        loading = false,
                        hasLoadedSnapshot = true,
                        singleSaveId = snapshot.home.singleSaveId,
                        hasSaves = snapshot.home.hasSaves || snapshot.home.pending,
                        error = null
                    )
                }
                StorageOutcome.Success(Unit)
            }
            is StorageOutcome.Failure -> {
                update { it.copy(loading = false, error = "存档暂时无法读取，请重试。") }
                result
            }
        }
    }

    fun loadSheet(daily: Boolean, variant: Variant) {
        selectSheet(if (daily) EntrySheet.Daily else EntrySheet.Setup(variant))
        sheet {
            if (daily) {
                SheetSnapshot.Daily(reads.readDaily(challengeDate(currentInstant())).value())
            } else {
                var result = reads.readSlotSummary(GameMode.FREE, variant).value()
                if (result != null && result.summary == null) {
                    reads.readSession(result.id).value()
                    result = reads.readSlotSummary(GameMode.FREE, variant).value()
                }
                SheetSnapshot.Free(result?.summary, result != null && result.summary == null)
            }
        }
    }

    fun loadSaves(more: Boolean = false) {
        selectSheet(EntrySheet.Continue)
        val before = uiState.value
        if (more && before.next == null) {
            return
        }
        sheet {
            val outcome = reads.readPage(
                query = SummaryQuery.Saves(unfinishedOnly = true),
                cursor = if (more) before.next else null
            )
            val stale = outcome is StorageOutcome.Failure && outcome.error.kind == StorageFailureKind.REVISION_CONFLICT
            val page = (
                if (stale) {
                    reads.readPage(
                        query = SummaryQuery.Saves(unfinishedOnly = true)
                    )
                } else {
                    outcome
                }
                ).value()
            check(page.epoch == before.epoch)
            val existing = if (more && !stale) before.saves else emptyList()
            SheetSnapshot.Saves(existing + page.items, page.next)
        }
    }

    private fun refreshSheet() {
        when (val selection = uiState.value.sheet) {
            is EntrySheet.Setup -> loadSheet(false, selection.variant)
            EntrySheet.Daily -> loadSheet(true, Variant.CLASSIC)
            EntrySheet.Continue -> loadSaves()
            null -> Unit
        }
    }

    private fun sheet(operation: suspend () -> SheetSnapshot) {
        cancelSheet()
        val generation = sheetGeneration
        val before = uiState.value
        update { it.copy(sheetLoading = true, sheetError = null) }
        sheetJob = scope.launch {
            try {
                val result = operation()
                check(repository.readDatasetEpoch().value() == before.epoch)
                currentCoroutineContext().ensureActive()
                // Cancellation alone cannot fence a storage call that has already committed.
                // Only this owner publishes, after checking request, selection and dataset identity.
                if (generation == sheetGeneration && before.sheet == uiState.value.sheet &&
                    before.epoch == uiState.value.epoch
                ) {
                    publish(result)
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                if (generation == sheetGeneration) {
                    update { it.copy(sheetError = "存档暂时无法读取，请重试。") }
                }
            } finally {
                if (generation == sheetGeneration) {
                    update { it.copy(sheetLoading = false) }
                }
            }
        }
    }

    private fun publish(snapshot: SheetSnapshot) {
        update { state ->
            when (snapshot) {
                is SheetSnapshot.Daily -> {
                    check(snapshot.value.epoch == state.epoch)
                    state.copy(daily = snapshot.value.statuses, today = snapshot.value.date)
                }
                is SheetSnapshot.Free -> state.copy(freeSave = snapshot.summary, freePending = snapshot.pending)
                is SheetSnapshot.Saves -> state.copy(saves = snapshot.items, next = snapshot.next)
            }
        }
    }

    private fun update(transform: (GameEntryUiState) -> GameEntryUiState) {
        mutableState.value = transform(mutableState.value)
    }
}

private sealed interface SheetSnapshot {
    data class Daily(val value: DailySnapshot) : SheetSnapshot

    data class Free(val summary: GameSummary?, val pending: Boolean) : SheetSnapshot

    data class Saves(val items: List<SummaryItem>, val next: SummaryCursor?) : SheetSnapshot
}

private fun <T> StorageOutcome<T>.value(): T = when (this) {
    is StorageOutcome.Success -> value
    is StorageOutcome.Failure -> error(error.message)
}
