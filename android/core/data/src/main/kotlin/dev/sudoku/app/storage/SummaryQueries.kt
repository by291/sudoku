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
import kotlinx.coroutines.flow.map

/** Queries compact projections without decoding canonical payloads. */
internal class SummaryQueries(private val database: SudokuDatabase, validator: MathematicalValidator) {
    private val dao = database.sudokuDao()
    private val summaries = database.summaryDao()
    private val codec = PortableCodec(validator)

    private suspend fun epoch() = dao.dataset()?.epoch ?: 0L

    suspend fun readBootstrap() = storageRead {
        database.withTransaction {
            val settings =
                dao.settings()?.let { codec.json.decodeFromString<Settings>(it.payload).also(codec::validateSettings) }
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

    suspend fun readPage(query: SummaryQuery, cursor: SummaryCursor?): StorageOutcome<SummaryPage> {
        val variant = query.variant
        val results = query is SummaryQuery.History
        val unfinished = query is SummaryQuery.Saves && query.unfinishedOnly
        val outcome = storageRead {
            database.withTransaction {
                val epoch = epoch()
                // Coverage upgrades may advance the projection generation. Capture the cursor
                // fence only after that upgrade so the first returned page remains appendable.
                val hasPending = if (results) {
                    summaries.pendingResults(
                        variant?.wireName
                    )
                } else {
                    summaries.pendingSessions()
                }
                val generation = summaries.generation() ?: 0
                if (cursor != null && (
                        cursor.generation != generation || cursor.epoch != epoch ||
                            cursor.query != query
                        )
                ) {
                    throw StaleSummaryCursor()
                }
                // Pending rows precede indexed ready rows. A generation fence prevents backfill
                // from moving a pending row into a later page of the same list.
                val pending = if (hasPending && (cursor == null || cursor.time == Long.MAX_VALUE)) {
                    if (results) {
                        summaries.pendingResultsPage(variant?.wireName, cursor?.id)
                    } else {
                        summaries.pendingSessionsPage(variant?.wireName, cursor?.id)
                    }
                } else {
                    emptyList()
                }

                val readyCursor = cursor?.takeIf { it.time != Long.MAX_VALUE }
                val time = readyCursor?.time ?: Long.MAX_VALUE
                val id = readyCursor?.id ?: ""
                val limit = 31 - pending.size
                val ready = if (limit == 0) {
                    emptyList()
                } else {
                    when {
                        results && variant != null -> summaries.resultsByVariant(variant.wireName, time, id, limit)
                        results -> summaries.results(time, id, limit)
                        unfinished && variant != null -> summaries.sessionsByVariantUnfinished(
                            variant.wireName,
                            time,
                            id,
                            limit
                        )
                        unfinished -> summaries.sessionsUnfinished(time, id, limit)
                        variant != null -> summaries.sessionsByVariant(variant.wireName, time, id, limit)
                        else -> summaries.sessions(time, id, limit)
                    }
                }

                val invalidCalendars = ready.filter { it.facts?.hasValidCalendar() == false }
                for (row in invalidCalendars) {
                    if (results) {
                        summaries.deleteResult(row.id)
                    } else {
                        summaries.deleteSession(row.id)
                    }
                }
                if (invalidCalendars.isNotEmpty() && cursor != null) {
                    // Commit the invalidation before requiring a refresh. Throwing here would
                    // roll it back and make the same stale calendar trap every retry.
                    return@withTransaction StorageOutcome.Failure(
                        StorageFailure(StorageFailureKind.REVISION_CONFLICT, "Saved list changed; refresh it")
                    )
                }

                val pendingRows = pending + invalidCalendars.map { it.copy(facts = null) }
                val rows = pendingRows.sortedByDescending { it.id } + ready.filterNot { it in invalidCalendars }
                val visible = rows.take(30)
                val last = visible.lastOrNull()
                val next = if (rows.size > 30 && last != null) {
                    SummaryCursor(
                        epoch,
                        summaries.generation() ?: 0,
                        query,
                        (if (results) last.facts?.completedAt else last.facts?.startedAt) ?: Long.MAX_VALUE,
                        last.id
                    )
                } else {
                    null
                }

                StorageOutcome.Success(
                    SummaryPage(
                        epoch,
                        visible.map { SummaryItem(it.id, it.domain()) },
                        next,
                        hasPending || invalidCalendars.isNotEmpty()
                    )
                )
            }
        }

        return when (outcome) {
            is StorageOutcome.Failure -> outcome
            is StorageOutcome.Success -> outcome.value
        }
    }

    suspend fun readDaily(date: String) = storageRead {
        require(isChallengeDate(date))
        database.withTransaction {
            DailySnapshot(
                epoch(),
                date,
                Variant.entries.associateWith { variant ->
                    val id = dailyFormalId(date, variant)
                    val saved = summaries.session(id)
                    val result = summaries.result(id)
                    when {
                        result != null || saved?.facts?.completedAt != null -> DailyStatus.COMPLETED
                        saved != null -> DailyStatus.IN_PROGRESS
                        summaries.sessionExists(id) || summaries.resultExists(id) -> DailyStatus.PENDING
                        else -> DailyStatus.NOT_STARTED
                    }
                }
            )
        }
    }

    suspend fun readOverview(variant: Variant, today: String) = storageRead {
        require(isChallengeDate(today))
        database.withTransaction {
            val statistics = RecordStatistics()
            for (row in summaries.freeBests(variant.wireName)) {
                statistics.includeFree(Difficulty.valueOf(row.difficulty), row.assisted, row.best)
            }

            val streak = dailyStatistics(variant, today, statistics)
            OverviewSnapshot(
                epoch(),
                statistics.summary(streak),
                summaries.pendingResults(variant.wireName)
            )
        }
    }

    /** Daily calendar validation streams only compact rows; it never decodes records or calls native code. */
    private suspend fun dailyStatistics(variant: Variant, today: String, statistics: RecordStatistics): StreakSummary {
        val streak = StreakStatistics(LocalDate.parse(today).toEpochDay())
        // Portable challenge dates have four-digit years; this exclusive sentinel sorts above them.
        var afterDate = "9999-12-32"
        var afterId = ""
        while (true) {
            val rows = summaries.dailyResults(variant.wireName, afterDate, afterId, DAILY_STATISTICS_BATCH_SIZE)
            if (rows.isEmpty()) {
                break
            }

            for (row in rows) {
                val facts = requireNotNull(row.facts)
                if (!facts.hasValidCalendar()) {
                    summaries.deleteResult(row.id)
                    continue
                }
                if (facts.formalAttempt == true) {
                    statistics.includeFormalDaily(facts.assisted)
                    facts.eligibleDate?.takeIf { it <= today }?.let { streak.include(LocalDate.parse(it).toEpochDay()) }
                }
            }

            // The SQL predicate guarantees a challenge date; ordering also bounds streak memory.
            val last = rows.last()
            afterDate = requireNotNull(last.facts?.challengeDate)
            afterId = last.id
        }
        return streak.summary()
    }

    suspend fun readSlotSummary(mode: GameMode, variant: Variant): StorageOutcome<SummaryItem?> = storageRead {
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
