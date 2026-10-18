package dev.sudoku.app.game

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModelStore
import dev.sudoku.app.model.BootstrapSnapshot
import dev.sudoku.app.model.DailySnapshot
import dev.sudoku.app.model.DailyStatus
import dev.sudoku.app.model.GameMode
import dev.sudoku.app.model.GameReadRepository
import dev.sudoku.app.model.GameRepository
import dev.sudoku.app.model.HomePresence
import dev.sudoku.app.model.Settings
import dev.sudoku.app.model.StorageFailure
import dev.sudoku.app.model.StorageFailureKind
import dev.sudoku.app.model.StorageOutcome
import dev.sudoku.app.model.SummaryCursor
import dev.sudoku.app.model.SummaryItem
import dev.sudoku.app.model.SummaryPage
import dev.sudoku.app.model.SummaryQuery
import dev.sudoku.app.model.Variant
import java.lang.reflect.Proxy
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GameEntryViewModelTest {
    @Test
    fun supersededDailyReadCannotPublishAfterSwitchingToFreeSetup() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val reads = SheetReads()
        val model = GameEntryViewModel(reads, reads.repository, SavedStateHandle())
        val store = ViewModelStore().apply { put("entry", model) }
        try {
            val gate = CompletableDeferred<Unit>()
            reads.dailyGate = gate
            model.loadSheet(true, Variant.CLASSIC)
            runCurrent()
            model.loadSheet(false, Variant.CLASSIC)
            runCurrent()

            gate.complete(Unit)
            runCurrent()

            assertTrue(model.uiState.value.daily.isEmpty())
            assertEquals(null, model.uiState.value.sheetError)
        } finally {
            store.clear()
            Dispatchers.resetMain()
        }
    }

    @Test
    fun restoredContinueSelectionReloadsOnlyItsPageAndReusesTheHomeBootstrap() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val reads = SheetReads()
        reads.pages += StorageOutcome.Success(SummaryPage(0, listOf(SummaryItem("current-save", null)), null, true))
        val savedState = SavedStateHandle(mapOf("entrySheet" to "continue"))
        val model = GameEntryViewModel(reads, reads.repository, savedState)
        val store = ViewModelStore().apply { put("entry", model) }
        try {
            model.open()
            runCurrent()

            assertEquals(EntrySheet.Continue, model.uiState.value.sheet)
            assertEquals(listOf("current-save"), model.uiState.value.saves.map { it.id })
            assertEquals(0, reads.bootstrapReads)

            model.dismissSheet()
            assertEquals(null, savedState.get<String>("entrySheet"))
        } finally {
            store.clear()
            Dispatchers.resetMain()
        }
    }

    @Test
    fun dismissingASheetCancelsItsLateSuccessWithoutPublishingPersonalFacts() = runTest {
        val reads = SheetReads()
        val owner = GameEntryController(reads, reads.repository, backgroundScope)
        val gate = CompletableDeferred<Unit>()
        reads.dailyGate = gate
        owner.loadSheet(true, Variant.CLASSIC)
        runCurrent()

        owner.dismissSheet()
        gate.complete(Unit)
        runCurrent()

        assertEquals(null, owner.uiState.value.sheet)
        assertTrue(owner.uiState.value.daily.isEmpty())
        assertEquals(false, owner.uiState.value.sheetLoading)
        assertEquals(null, owner.uiState.value.sheetError)
    }

    @Test
    fun anOldRequestCannotClearTheNewSheetsLoadingState() = runTest {
        val reads = SheetReads()
        val owner = GameEntryController(reads, reads.repository, backgroundScope)
        val oldGate = CompletableDeferred<Unit>()
        reads.dailyGate = oldGate
        owner.loadSheet(true, Variant.CLASSIC)
        runCurrent()
        val newGate = CompletableDeferred<Unit>()
        reads.slotGate = newGate
        owner.loadSheet(false, Variant.DIAGONAL)
        runCurrent()

        oldGate.complete(Unit)
        runCurrent()

        assertEquals(EntrySheet.Setup(Variant.DIAGONAL), owner.uiState.value.sheet)
        assertTrue(owner.uiState.value.sheetLoading)
        assertTrue(owner.uiState.value.daily.isEmpty())

        newGate.complete(Unit)
        runCurrent()
        assertEquals(false, owner.uiState.value.sheetLoading)
    }

    @Test
    fun stalePaginationRestartsTheFirstPageInsteadOfAppendingIncompatibleRows() = runTest {
        val reads = SheetReads()
        val cursor = SummaryCursor(0, 0, SummaryQuery.Saves(unfinishedOnly = true), 1, "old")
        reads.pages += StorageOutcome.Success(SummaryPage(0, listOf(SummaryItem("old", null)), cursor, true))
        reads.pages += StorageOutcome.Failure(StorageFailure(StorageFailureKind.REVISION_CONFLICT, "Cursor changed"))
        reads.pages += StorageOutcome.Success(SummaryPage(0, listOf(SummaryItem("replacement", null)), null, true))
        val owner = GameEntryController(reads, reads.repository, backgroundScope)
        owner.showContinue()
        runCurrent()

        owner.loadSaves(more = true)
        runCurrent()

        assertEquals(listOf("replacement"), owner.uiState.value.saves.map { it.id })
        assertEquals(listOf(null, cursor, null), reads.cursors)
        assertEquals(null, owner.uiState.value.next)
        assertEquals(null, owner.uiState.value.sheetError)
    }

    @Test
    fun datasetReplacementClearsPresenceAndFencesTheOldDailyCompletion() = runTest {
        val reads = SheetReads()
        val owner = GameEntryController(reads, reads.repository, backgroundScope)
        val gate = CompletableDeferred<Unit>()
        reads.dailyGate = gate
        owner.loadSheet(true, Variant.CLASSIC)
        runCurrent()

        reads.dailyGate = null
        reads.epoch = 1
        reads.bootstrap.value = BootstrapSnapshot(1, Settings(), HomePresence(false, false))
        reads.epochs.emit(1)
        runCurrent()
        gate.complete(Unit)
        runCurrent()

        assertEquals(1L, owner.uiState.value.epoch)
        assertEquals(false, owner.uiState.value.hasSaves)
        assertEquals(mapOf(Variant.CLASSIC to DailyStatus.NOT_STARTED), owner.uiState.value.daily)
        assertEquals(EntrySheet.Daily, owner.uiState.value.sheet)
        assertEquals(null, owner.uiState.value.sheetError)
    }
}

private class SheetReads : GameReadRepository by unsupportedEntryContract(GameReadRepository::class.java) {
    override val bootstrap =
        MutableStateFlow<BootstrapSnapshot?>(BootstrapSnapshot(0, Settings(), HomePresence(false, false)))
    val epochs = MutableSharedFlow<Long>()
    var epoch = 0L
    var bootstrapReads = 0
    var dailyGate: CompletableDeferred<Unit>? = null
    var slotGate: CompletableDeferred<Unit>? = null
    val pages = ArrayDeque<StorageOutcome<SummaryPage>>()
    val cursors = mutableListOf<SummaryCursor?>()
    val repository = object : GameRepository by unsupportedEntryContract(GameRepository::class.java) {
        override val datasetEpochs = epochs

        override suspend fun readDatasetEpoch() = StorageOutcome.Success(epoch)
    }

    override suspend fun readDaily(date: String): StorageOutcome<DailySnapshot> {
        val status = if (epoch == 0L) DailyStatus.COMPLETED else DailyStatus.NOT_STARTED
        val result = DailySnapshot(epoch, date, mapOf(Variant.CLASSIC to status))
        // Simulate a storage transaction that has passed its cancellation boundary.
        withContext(NonCancellable) { dailyGate?.await() }
        return StorageOutcome.Success(result)
    }

    override suspend fun readBootstrap(): StorageOutcome<BootstrapSnapshot> {
        bootstrapReads++
        return StorageOutcome.Success(checkNotNull(bootstrap.value))
    }

    override suspend fun readSlotSummary(mode: GameMode, variant: Variant): StorageOutcome<SummaryItem?> {
        slotGate?.await()
        return StorageOutcome.Success(null)
    }

    override suspend fun readPage(
        query: dev.sudoku.app.model.SummaryQuery,
        cursor: SummaryCursor?
    ): StorageOutcome<SummaryPage> {
        cursors += cursor
        return pages.removeFirst()
    }
}

private fun <T : Any> unsupportedEntryContract(contract: Class<T>): T = checkNotNull(
    contract.cast(
        Proxy.newProxyInstance(contract.classLoader, arrayOf(contract)) { _, method, _ ->
            error("Unexpected entry operation: ${method.name}")
        }
    )
)
