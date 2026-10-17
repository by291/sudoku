package dev.sudoku.app.model

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

/** Presentation facts only; selected payloads must still be validated before use. */
data class GameSummary(
    val id: String,
    val revision: Long,
    val variant: Variant,
    val difficulty: Difficulty,
    val metadata: SessionMetadata,
    val startedAt: String,
    val elapsedMs: Long,
    val completion: Completion?,
    val assisted: Boolean,
    val filled: Int,
    val editable: Int
) {
    val mode: GameMode get() = metadata.mode
}

/** A missing summary means an existing legacy record needs validation, never that it is absent. */
data class SummaryItem(val id: String, val summary: GameSummary?)
data class HomePresence(val hasSaves: Boolean, val pending: Boolean, val singleSaveId: String? = null)
data class BootstrapSnapshot(val epoch: Long, val settings: Settings, val home: HomePresence)
data class SummaryCursor(
    val epoch: Long,
    val generation: Long,
    val variant: Variant?,
    val results: Boolean,
    val unfinished: Boolean,
    val time: Long,
    val id: String
)
data class SummaryPage(val epoch: Long, val items: List<SummaryItem>, val next: SummaryCursor?, val pending: Boolean)
data class OverviewSnapshot(val epoch: Long, val summary: RecordSummary, val pending: Boolean)
enum class DailyStatus { NOT_STARTED, IN_PROGRESS, COMPLETED, PENDING }
data class DailySnapshot(val epoch: Long, val date: String, val statuses: Map<Variant, DailyStatus>)

/** Read models are shared by feature owners; portable mutations remain in GameRepository. */
interface GameReadRepository {
    val bootstrap: StateFlow<BootstrapSnapshot?>
    val changes: Flow<Unit>
    suspend fun readBootstrap(): StorageOutcome<BootstrapSnapshot>
    suspend fun readPage(
        variant: Variant? = null,
        results: Boolean = false,
        unfinished: Boolean = false,
        cursor: SummaryCursor? = null
    ): StorageOutcome<SummaryPage>
    suspend fun readOverview(variant: Variant, today: String): StorageOutcome<OverviewSnapshot>
    suspend fun readDaily(date: String): StorageOutcome<DailySnapshot>
    suspend fun readSession(id: String): StorageOutcome<SessionRecord?>
    suspend fun readResult(id: String): StorageOutcome<ResultRecord?>
    suspend fun readSlotSummary(mode: GameMode, variant: Variant): StorageOutcome<SummaryItem?>
    suspend fun readSlot(mode: GameMode, variant: Variant): StorageOutcome<SessionRecord?>

    /** Validates pending rows one at a time; cancellation and inconclusive failures preserve them. */
    suspend fun backfill(): StorageOutcome<Unit>
}
