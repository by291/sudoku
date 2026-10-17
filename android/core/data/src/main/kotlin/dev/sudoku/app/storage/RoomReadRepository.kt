package dev.sudoku.app.storage

import androidx.room.withTransaction
import dev.sudoku.app.model.BestTimes
import dev.sudoku.app.model.BootstrapSnapshot
import dev.sudoku.app.model.DailySnapshot
import dev.sudoku.app.model.DailyStatus
import dev.sudoku.app.model.DailyTotals
import dev.sudoku.app.model.Difficulty
import dev.sudoku.app.model.GameMode
import dev.sudoku.app.model.GameReadRepository
import dev.sudoku.app.model.HomePresence
import dev.sudoku.app.model.MathematicalValidator
import dev.sudoku.app.model.OverviewSnapshot
import dev.sudoku.app.model.PortableCodec
import dev.sudoku.app.model.RecordSummary
import dev.sudoku.app.model.ResultRecord
import dev.sudoku.app.model.SessionRecord
import dev.sudoku.app.model.Settings
import dev.sudoku.app.model.StorageFailure
import dev.sudoku.app.model.StorageFailureKind
import dev.sudoku.app.model.StorageOutcome
import dev.sudoku.app.model.SummaryCursor
import dev.sudoku.app.model.SummaryItem
import dev.sudoku.app.model.SummaryPage
import dev.sudoku.app.model.Variant
import dev.sudoku.app.model.dailyFormalId
import dev.sudoku.app.model.isChallengeDate
import java.time.LocalDate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.yield

/** Projection reads never deserialize payloads. Detail reads repair only their selected projection. */
class RoomReadRepository(private val database: SudokuDatabase, validator: MathematicalValidator) : GameReadRepository {
    private val dao = database.sudokuDao()
    private val summaries = database.summaryDao()
    private val codec = PortableCodec(validator)
    private val initial = MutableStateFlow<BootstrapSnapshot?>(null)
    override val bootstrap = initial.asStateFlow()
    private val maintenance = Mutex()
    override val changes = database.invalidationTracker.createFlow(
        "session_summaries",
        "result_summaries",
        "dataset"
    ).map { Unit }

    private suspend fun epoch() = dao.dataset()?.epoch ?: 0L

    override suspend fun readBootstrap() = read {
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
                .also { initial.value = it }
        }
    }

    override suspend fun readPage(variant: Variant?, results: Boolean, unfinished: Boolean, cursor: SummaryCursor?) =
        read {
            database.withTransaction {
                val epoch = epoch()
                val generation = summaries.generation() ?: 0
                if (cursor != null && (
                        cursor.generation != generation || cursor.epoch != epoch ||
                            cursor.variant != variant || cursor.results != results || cursor.unfinished != unfinished
                        )
                ) {
                    throw StaleSummaryCursor()
                }
                // Pending rows precede indexed ready rows. A generation fence prevents backfill
                // from moving a pending row into a later page of the same list.
                val hasPending = if (results) {
                    summaries.pendingResults(
                        variant?.wireName
                    )
                } else {
                    summaries.pendingSessions()
                }
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
                val rows = pending + ready
                val visible = rows.take(30)
                val last = visible.lastOrNull()
                val next = if (rows.size > 30 && last != null) {
                    SummaryCursor(
                        epoch,
                        generation,
                        variant,
                        results,
                        unfinished,
                        (if (results) last.facts?.completedAt else last.facts?.startedAt) ?: Long.MAX_VALUE,
                        last.id
                    )
                } else {
                    null
                }
                SummaryPage(
                    epoch,
                    visible.map { SummaryItem(it.id, it.domain()) },
                    next,
                    hasPending
                )
            }
        }

    override suspend fun readDaily(date: String) = read {
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

    override suspend fun readOverview(variant: Variant, today: String) = read {
        require(isChallengeDate(today))
        database.withTransaction {
            val bests = Difficulty.entries.associateWith { BestTimes() }.toMutableMap()
            var assisted = 0
            var unassisted = 0
            for (row in summaries.aggregates(variant.wireName)) {
                if (row.mode == GameMode.FREE.name) {
                    val difficulty = Difficulty.valueOf(row.difficulty)
                    val previous = bests.getValue(difficulty)
                    bests[difficulty] =
                        if (row.assisted) previous.copy(assisted = row.best) else previous.copy(unassisted = row.best)
                } else if (row.assisted) {
                    assisted += row.total
                } else {
                    unassisted += row.total
                }
            }
            val days = summaries.eligibleDates(variant.wireName, today).map { LocalDate.parse(it).toEpochDay() }.toSet()
            var run = 0
            var longest = 0
            var previous: Long? = null
            for (day in days.sorted()) {
                run = if (previous != null && day == previous + 1) run + 1 else 1
                longest = maxOf(longest, run)
                previous = day
            }
            var day = LocalDate.parse(today).toEpochDay()
            if (day !in days) day--
            var current = 0
            while (day in days) {
                current++
                day--
            }
            OverviewSnapshot(
                epoch(),
                RecordSummary(bests, DailyTotals(assisted, unassisted), current, longest),
                summaries.pendingResults(variant.wireName)
            )
        }
    }

    override suspend fun readSession(id: String): StorageOutcome<SessionRecord?> = read {
        val (epoch, entity) = database.withTransaction { epoch() to dao.session(id) }
        if (entity == null) return@read null
        val record = try {
            codec.decodeSessionRecord(entity.payload).also {
                require(it.session.id == id && it.revision == entity.revision)
            }
        } catch (error: IllegalArgumentException) {
            database.withTransaction {
                if (epoch() == epoch && dao.deleteSession(id, entity.revision) == 1) {
                    summaries.deleteSession(id)
                    dao.putQuarantine(
                        QuarantineEntity(
                            "sessions:$id",
                            "sessions",
                            entity.payload,
                            error.message ?: "Invalid session"
                        )
                    )
                }
            }
            throw error
        }
        database.withTransaction {
            check(epoch() == epoch && dao.session(id)?.revision == entity.revision) {
                "Session changed during validation"
            }
            val projected = SessionSummaryEntity(id, record.revision, record.session.summaryFields())
            if (summaries.session(id) != projected) summaries.putSession(projected)
        }
        record
    }

    override suspend fun readResult(id: String): StorageOutcome<ResultRecord?> = read {
        val (epoch, entity) = database.withTransaction { epoch() to dao.result(id) }
        if (entity == null) return@read null
        val record = try {
            codec.decodeResultRecord(entity.payload).also {
                require(it.session.id == id && it.session.completion != null)
            }
        } catch (error: IllegalArgumentException) {
            database.withTransaction {
                if (epoch() == epoch && dao.deleteResult(id, entity.payload) == 1) {
                    summaries.deleteResult(id)
                    dao.putQuarantine(
                        QuarantineEntity(
                            "results:$id",
                            "results",
                            entity.payload,
                            error.message ?: "Invalid result"
                        )
                    )
                }
            }
            throw error
        }
        database.withTransaction {
            check(epoch() == epoch && dao.result(id)?.payload == entity.payload) { "Result changed during validation" }
            val projected = ResultSummaryEntity(id, record.session.summaryFields())
            if (summaries.result(id) != projected) {
                summaries.deleteResult(id)
                summaries.putResult(projected)
            }
        }
        record
    }

    override suspend fun readSlotSummary(mode: GameMode, variant: Variant): StorageOutcome<SummaryItem?> = read {
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

    override suspend fun readSlot(mode: GameMode, variant: Variant): StorageOutcome<SessionRecord?> = read {
        require(mode != GameMode.DAILY)
        val ids = summaries.slotIds(mode.name, variant.wireName)
        check(ids.size <= 1) { "Multiple active slots" }
        ids.firstOrNull()?.let { readSession(it).value() }
    }

    override suspend fun backfill(): StorageOutcome<Unit> = maintenance.withLock {
        read {
            val startEpoch = epoch()
            var failure: StorageOutcome.Failure? = null
            for (results in listOf(false, true)) {
                val pending = if (results) summaries.pendingResults() else summaries.pendingSessions()
                if (!pending) continue
                var after = ""
                while (epoch() == startEpoch) {
                    val id = if (results) summaries.nextResult(after) else summaries.nextSession(after)
                    if (id == null) break
                    val outcome = if (results) readResult(id) else readSession(id)
                    if (outcome is StorageOutcome.Failure) failure = outcome
                    after = id
                    yield()
                }
                if (epoch() == startEpoch) {
                    if (results) summaries.pendingResults() else summaries.pendingSessions()
                }
            }
            failure?.let { throw IllegalStateException(it.error.message) }
            Unit
        }
    }

    private suspend fun <T> read(block: suspend () -> T): StorageOutcome<T> = withContext(Dispatchers.IO) {
        try {
            StorageOutcome.Success(block())
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            val kind = if (error is StaleSummaryCursor) {
                StorageFailureKind.REVISION_CONFLICT
            } else if (error is IllegalArgumentException) {
                StorageFailureKind.INVALID_DATA
            } else {
                StorageFailureKind.UNAVAILABLE
            }
            StorageOutcome.Failure(StorageFailure(kind, error.message ?: "Unable to read local data"))
        }
    }
}

private fun <T> StorageOutcome<T>.value(): T = when (this) {
    is StorageOutcome.Success -> value
    is StorageOutcome.Failure -> throw IllegalStateException(error.message)
}

private class StaleSummaryCursor : IllegalStateException("Saved list changed; refresh it")
