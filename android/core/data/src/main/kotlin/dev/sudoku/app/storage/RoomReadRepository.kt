package dev.sudoku.app.storage

import dev.sudoku.app.model.BootstrapSnapshot
import dev.sudoku.app.model.GameMode
import dev.sudoku.app.model.GameReadRepository
import dev.sudoku.app.model.MathematicalValidator
import dev.sudoku.app.model.StorageOutcome
import dev.sudoku.app.model.SummaryCursor
import dev.sudoku.app.model.SummaryQuery
import dev.sudoku.app.model.Variant
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map

/** Public read coordinator; writes remain ordered by RoomGameRepository and fenced transactions. */
class RoomReadRepository(private val database: SudokuDatabase, validator: MathematicalValidator) : GameReadRepository {
    private val queries = SummaryQueries(database, validator)
    private val details = RecordDetails(database, validator)
    private val maintenance = SummaryMaintenance(database, details)
    private val initial = MutableStateFlow<BootstrapSnapshot?>(null)
    override val bootstrap = initial.asStateFlow()
    override val changes = database.invalidationTracker.createFlow(
        "session_summaries",
        "result_summaries",
        "dataset"
    ).map { Unit }

    override suspend fun readBootstrap(): StorageOutcome<BootstrapSnapshot> = queries.readBootstrap().also {
        if (it is StorageOutcome.Success) {
            initial.value = it.value
        }
    }

    override suspend fun readPage(query: SummaryQuery, cursor: SummaryCursor?) = queries.readPage(query, cursor)

    override suspend fun readOverview(variant: Variant, today: String) = queries.readOverview(variant, today)

    override suspend fun readDaily(date: String) = queries.readDaily(date)

    override suspend fun readSession(id: String) = details.readSession(id)

    override suspend fun readResult(id: String) = details.readResult(id)

    override suspend fun readSlotSummary(mode: GameMode, variant: Variant) = queries.readSlotSummary(mode, variant)

    override suspend fun readSlot(mode: GameMode, variant: Variant) = details.readSlot(mode, variant)

    override suspend fun backfill() = maintenance.backfill()
}
