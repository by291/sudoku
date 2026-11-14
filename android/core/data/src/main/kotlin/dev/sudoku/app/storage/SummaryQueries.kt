package dev.sudoku.app.storage

import androidx.room.withTransaction
import dev.sudoku.app.model.BootstrapSnapshot
import dev.sudoku.app.model.DailySnapshot
import dev.sudoku.app.model.DailyStatus
import dev.sudoku.app.model.Difficulty
import dev.sudoku.app.model.GameMode
import dev.sudoku.app.model.HomePresence
import dev.sudoku.app.model.MathematicalValidator
import dev.sudoku.app.model.OverviewSnapshot
import dev.sudoku.app.model.PortableCodec
import dev.sudoku.app.model.RecordStatistics
import dev.sudoku.app.model.Settings
import dev.sudoku.app.model.StorageFailure
import dev.sudoku.app.model.StorageFailureKind
import dev.sudoku.app.model.StorageOutcome
import dev.sudoku.app.model.StreakStatistics
import dev.sudoku.app.model.StreakSummary
import dev.sudoku.app.model.SummaryCursor
import dev.sudoku.app.model.SummaryItem
import dev.sudoku.app.model.SummaryPage
import dev.sudoku.app.model.SummaryQuery
import dev.sudoku.app.model.Variant
import dev.sudoku.app.model.dailyFormalId
import dev.sudoku.app.model.isChallengeDate
import java.time.LocalDate

/** Queries compact projections without decoding canonical payloads. */
internal class SummaryQueries(
    private val database: SudokuDatabase,
    validator: MathematicalValidator
) {
    private val dao = database.sudokuDao()
    private val summaries = database.summaryDao()
    private val codec = PortableCodec(validator)

    private suspend fun epoch() = dao.dataset()?.epoch ?: 0L

    suspend fun readBootstrap() = storageRead {
        database.withTransaction {
            val settings =
                dao.settings()?.let {
                    codec.json.decodeFromString<Settings>(it.payload).also(codec::validateSettings)
                }
                    ?: Settings()
            val ids = summaries.unfinishedIds()
            val pending = summaries.pendingSessions()
            BootstrapSnapshot(
                epoch(),
                settings,
                HomePresence(
                    ids.isNotEmpty(),
                    pending,
                    ids.singleOrNull()?.takeUnless {
                        pending
                    }
                )
            )
        }
    }

    /** Reads a bounded page under its query, dataset and projection generation fence. */
    suspend fun readPage(query: SummaryQuery, cursor: SummaryCursor?): StorageOutcome<SummaryPage> {
        val filter = PageFilter(query, cursor)
        val outcome = storageRead {
            database.withTransaction {
                readPageInTransaction(filter)
            }
        }

        return when (outcome) {
            is StorageOutcome.Failure -> outcome
            is StorageOutcome.Success -> outcome.value
        }
    }

    private suspend fun readPageInTransaction(filter: PageFilter): StorageOutcome<SummaryPage> {
        val epoch = epoch()
        val cursor = filter.cursor

        // Coverage upgrades may advance the fence, so capture generation after upgrading.
        val hasPending = if (filter.isHistory) {
            summaries.pendingResults(filter.variant)
        } else {
            summaries.pendingSessions()
        }
        val generation = summaries.generation() ?: 0
        if (cursor != null &&
            (
                cursor.generation != generation || cursor.epoch != epoch ||
                    cursor.query != filter.query
                )
        ) {
            throw StaleSummaryCursor()
        }

        // A generation fence prevents backfill from moving pending rows later in this same list.
        val pending = pendingRows(filter, hasPending = hasPending)
        val ready = readyRows(filter, limit = PAGE_SIZE + 1 - pending.size)
        val invalidCalendars = ready.filter { it.facts?.hasValidCalendar() == false }
        invalidateCalendars(invalidCalendars, isHistory = filter.isHistory)
        if (invalidCalendars.isNotEmpty() && cursor != null) {
            // Return the conflict after committing invalidation so a retry can make progress.
            return StorageOutcome.Failure(
                StorageFailure(
                    StorageFailureKind.REVISION_CONFLICT,
                    "Saved list changed; refresh it"
                )
            )
        }

        val pendingRows = pending + invalidCalendars.map { it.copy(facts = null) }
        val orderedPending = pendingRows.sortedByDescending { it.id }
        val validRows = ready.filterNot { it in invalidCalendars }
        val rows = orderedPending + validRows
        val visible = rows.take(PAGE_SIZE)
        val last = visible.lastOrNull()
        val next = if (rows.size > PAGE_SIZE && last != null) {
            SummaryCursor(
                epoch = epoch,
                generation = summaries.generation() ?: 0,
                query = filter.query,
                time = cursorTime(last, isHistory = filter.isHistory),
                id = last.id
            )
        } else {
            null
        }

        return StorageOutcome.Success(
            SummaryPage(
                epoch = epoch,
                items = visible.map { SummaryItem(it.id, it.domain()) },
                next = next,
                pending = hasPending || invalidCalendars.isNotEmpty()
            )
        )
    }

    private suspend fun pendingRows(filter: PageFilter, hasPending: Boolean): List<SummaryRow> {
        val cursor = filter.cursor
        if (!hasPending || (cursor != null && cursor.time != PENDING_TIME)) {
            return emptyList()
        }

        return if (filter.isHistory) {
            summaries.pendingResultsPage(filter.variant, cursor?.id)
        } else {
            summaries.pendingSessionsPage(filter.variant, cursor?.id)
        }
    }

    private suspend fun readyRows(filter: PageFilter, limit: Int): List<SummaryRow> {
        if (limit == 0) {
            return emptyList()
        }

        val cursor = filter.cursor?.takeIf { it.time != PENDING_TIME }
        val time = cursor?.time ?: PENDING_TIME
        val id = cursor?.id.orEmpty()
        val variant = filter.variant
        if (filter.isHistory) {
            return if (variant == null) {
                summaries.results(time, id, limit)
            } else {
                summaries.resultsByVariant(variant, time, id, limit)
            }
        }

        return when {
            filter.isUnfinishedOnly && variant != null ->
                summaries.sessionsByVariantUnfinished(variant, time, id, limit)
            filter.isUnfinishedOnly -> summaries.sessionsUnfinished(time, id, limit)
            variant != null -> summaries.sessionsByVariant(variant, time, id, limit)
            else -> summaries.sessions(time, id, limit)
        }
    }

    private suspend fun invalidateCalendars(rows: List<SummaryRow>, isHistory: Boolean) {
        for (row in rows) {
            if (isHistory) {
                summaries.deleteResult(row.id)
            } else {
                summaries.deleteSession(row.id)
            }
        }
    }

    private fun cursorTime(row: SummaryRow, isHistory: Boolean): Long {
        val time = if (isHistory) row.facts?.completedAt else row.facts?.startedAt
        return time ?: PENDING_TIME
    }

    /** Reads all formal-attempt statuses from one committed projection snapshot. */
    suspend fun readDaily(date: String) = storageRead {
        require(isChallengeDate(date))
        database.withTransaction {
            DailySnapshot(
                epoch(),
                date,
                Variant.entries.associateWith { variant ->
                    readFormalStatus(dailyFormalId(date, variant))
                }
            )
        }
    }

    private suspend fun readFormalStatus(id: String): DailyStatus {
        val saved = summaries.session(id)
        val result = summaries.result(id)

        return when {
            result != null || saved?.facts?.completedAt != null -> DailyStatus.COMPLETED
            // A retained result may still be awaiting its projection.
            summaries.resultExists(id) -> DailyStatus.PENDING
            saved != null -> DailyStatus.IN_PROGRESS
            summaries.sessionExists(id) -> DailyStatus.PENDING
            else -> DailyStatus.NOT_STARTED
        }
    }

    /** Aggregates compact result facts and reports incomplete coverage separately. */
    suspend fun readOverview(variant: Variant, today: String) = storageRead {
        require(isChallengeDate(today))
        database.withTransaction {
            val statistics = RecordStatistics()
            for (row in summaries.freeBests(variant.wireName)) {
                statistics.includeFree(
                    difficulty = Difficulty.valueOf(row.difficulty),
                    assisted = row.assisted,
                    elapsedMs = row.best
                )
            }

            val streak = dailyStatistics(variant, today, statistics)
            OverviewSnapshot(
                epoch(),
                statistics.summary(streak),
                summaries.pendingResults(variant.wireName)
            )
        }
    }

    /** Streams compact rows so calendar validation needs no native calls or full records. */
    private suspend fun dailyStatistics(
        variant: Variant,
        today: String,
        statistics: RecordStatistics
    ): StreakSummary {
        val streak = StreakStatistics(LocalDate.parse(today).toEpochDay())
        val daily = DailyStatistics(today, statistics, streak)

        // Portable challenge dates have four-digit years; this exclusive sentinel sorts above them.
        var afterDate = FIRST_DAILY_BATCH_BOUND
        var afterId = ""
        while (true) {
            val rows = summaries.dailyResults(
                variant.wireName,
                afterDate,
                afterId,
                DAILY_STATISTICS_BATCH_SIZE
            )
            if (rows.isEmpty()) {
                break
            }

            for (row in rows) {
                includeDailyRow(row, daily)
            }

            // The SQL predicate guarantees a challenge date; ordering also bounds streak memory.
            val last = rows.last()
            afterDate = requireNotNull(last.facts?.challengeDate)
            afterId = last.id
        }

        return streak.summary()
    }

    private suspend fun includeDailyRow(row: SummaryRow, daily: DailyStatistics) {
        val facts = requireNotNull(row.facts)
        if (!facts.hasValidCalendar()) {
            summaries.deleteResult(row.id)
            return
        }
        if (facts.formalAttempt != true) {
            return
        }

        daily.totals.includeFormalDaily(assisted = facts.assisted)
        val eligibleDate = facts.eligibleDate ?: return
        if (eligibleDate <= daily.today) {
            daily.streak.include(LocalDate.parse(eligibleDate).toEpochDay())
        }
    }

    /** Resolves one active slot without decoding the payload or treating pending as absent. */
    suspend fun readSlotSummary(mode: GameMode, variant: Variant): StorageOutcome<SummaryItem?> =
        storageRead {
            require(mode != GameMode.DAILY)
            database.withTransaction {
                val ids = summaries.slotIds(mode.name, variant.wireName)
                check(ids.size <= 1) { "Multiple active slots" }
                ids.firstOrNull()?.let { id ->
                    val row = summaries.session(id)
                    SummaryItem(id, row?.let { SummaryRow(id, it.revision, it.facts).domain() })
                }
            }
        }
}

private const val DAILY_STATISTICS_BATCH_SIZE = 128

private const val PAGE_SIZE = 30
private const val PENDING_TIME = Long.MAX_VALUE
private const val FIRST_DAILY_BATCH_BOUND = "9999-12-32"

private data class PageFilter(val query: SummaryQuery, val cursor: SummaryCursor?) {
    val variant: String? get() = query.variant?.wireName
    val isHistory: Boolean get() = query is SummaryQuery.History
    val isUnfinishedOnly: Boolean get() = query is SummaryQuery.Saves && query.unfinishedOnly
}

private data class DailyStatistics(
    val today: String,
    val totals: RecordStatistics,
    val streak: StreakStatistics
)
