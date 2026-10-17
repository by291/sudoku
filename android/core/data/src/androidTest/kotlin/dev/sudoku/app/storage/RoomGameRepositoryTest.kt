package dev.sudoku.app.storage

import androidx.room.Room
import androidx.room.withTransaction
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import dev.sudoku.app.model.Completion
import dev.sudoku.app.model.Difficulty
import dev.sudoku.app.model.EngineOutcome
import dev.sudoku.app.model.GameSession
import dev.sudoku.app.model.MathematicalValidator
import dev.sudoku.app.model.Puzzle
import dev.sudoku.app.model.PuzzleAssessment
import dev.sudoku.app.model.PuzzleContent
import dev.sudoku.app.model.PuzzleRules
import dev.sudoku.app.model.SessionMetadata
import dev.sudoku.app.model.Settings
import dev.sudoku.app.model.StorageFailureKind
import dev.sudoku.app.model.StorageOutcome
import dev.sudoku.app.model.ThemePreference
import dev.sudoku.app.model.Validation
import dev.sudoku.app.model.Variant
import dev.sudoku.app.model.createSession
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RoomGameRepositoryTest {
    private lateinit var database: SudokuDatabase
    private lateinit var repository: RoomGameRepository
    private var validationCalls = 0
    private val validator = object : MathematicalValidator {
        override suspend fun validatePuzzle(content: PuzzleContent): EngineOutcome<Validation> {
            validationCalls++
            return EngineOutcome.Completed(Validation.Valid)
        }
        override suspend fun validateAssessment(
            value: PuzzleAssessment?,
            variant: Variant,
            difficulty: Difficulty
        ): EngineOutcome<PuzzleAssessment?> = EngineOutcome.Completed(value)
    }

    @Before fun createDatabase() {
        database =
            Room.inMemoryDatabaseBuilder(
                ApplicationProvider.getApplicationContext(),
                SudokuDatabase::class.java
            ).build()
        repository = RoomGameRepository(database, validator)
    }

    @After fun closeDatabase() = database.close()

    @Test fun historyPagesHaveStableTieBreakingAndRejectAnOldDatasetCursor() = runTest {
        val base = fixture().copy(elapsedMs = 500, completion = Completion("2026-10-16T01:02:04.000Z", 500))
        for (index in 0 until 65) {
            val session = base.copy(id = "result-${index.toString().padStart(3, '0')}")
            repository.writeSession(session, 0, repository.claimEditor(session.id, "owner").value()).value()
        }
        val reads = RoomReadRepository(database, validator)
        validationCalls = 0
        val first = reads.readPage(results = true).value()
        val second = reads.readPage(results = true, cursor = first.next).value()
        val third = reads.readPage(results = true, cursor = second.next).value()

        assertEquals(30, first.items.size)
        assertEquals(30, second.items.size)
        assertEquals(5, third.items.size)
        assertEquals(65, (first.items + second.items + third.items).map { it.id }.toSet().size)
        assertEquals(0, validationCalls)
        repository.clearAll(first.epoch).value()
        assertTrue(reads.readPage(results = true, cursor = first.next) is StorageOutcome.Failure)
    }

    @Test fun backfillInvalidatesPaginationBeforePendingRowsCanRepeat() = runTest {
        for (index in 0 until 35) {
            val session = fixture().copy(id = "pending-${index.toString().padStart(2, '0')}")
            repository.writeSession(session, 0, repository.claimEditor(session.id, "owner").value()).value()
        }
        database.summaryDao().clearSessions()
        val reads = RoomReadRepository(database, validator)
        val first = reads.readPage(unfinished = true).value()
        assertEquals(30, first.items.size)
        assertTrue(first.items.all { it.summary == null })

        reads.readSession(first.items.first().id).value()
        val stale = reads.readPage(unfinished = true, cursor = first.next)

        assertEquals(StorageFailureKind.REVISION_CONFLICT, (stale as StorageOutcome.Failure).error.kind)
        val refreshed = reads.readPage(unfinished = true).value()
        val rest = reads.readPage(unfinished = true, cursor = refreshed.next).value()
        assertEquals(35, (refreshed.items + rest.items).map { it.id }.toSet().size)
    }

    @Test fun summaryReadsStayBoundedAcrossHistorySizesWithoutDecodingPayloads() = runTest {
        val reads = RoomReadRepository(database, validator)
        val facts = fixture().copy(
            elapsedMs = 500,
            completion = Completion("2026-10-16T01:02:04.000Z", 500)
        ).summaryFields()
        // Intentionally opaque payloads prove these read paths never deserialize restoration data.
        // This is a read-isolation test, not a benchmark of valid long undo histories.
        val opaque = "unread payload ".repeat(150)
        var inserted = 0
        for (count in listOf(0, 100, 1_000, 10_000)) {
            database.withTransaction {
                for (index in inserted until count) {
                    val id = "history-${index.toString().padStart(5, '0')}"
                    database.sudokuDao().putOriginalResult(ResultEntity(id, "FREE", "classic", null, opaque))
                    database.summaryDao().insertResult(ResultSummaryEntity(id, facts))
                }
                database.summaryDao().changed()
            }
            inserted = count
            validationCalls = 0

            assertTrue(!reads.readBootstrap().value().home.hasSaves)
            assertEquals(minOf(count, 30), reads.readPage(results = true).value().items.size)
            val overview = reads.readOverview(Variant.CLASSIC, "2026-10-17").value()
            assertEquals(
                if (count ==
                    0
                ) {
                    null
                } else {
                    500L
                },
                overview.summary.freeBests.getValue(Difficulty.EASY).unassisted
            )
            assertEquals(0, validationCalls)
            assertEquals(0, repository.countQuarantined().value())
        }
    }

    @Test fun overviewRetainsFormalTotalsAndExcludesLateCompletionsFromStreaks() = runTest {
        val rows = listOf(
            Triple("2026-10-14", "2026-10-14T15:59:00.000Z", false),
            Triple("2026-10-15", "2026-10-15T15:59:00.000Z", true),
            Triple("2026-10-16", "2026-10-16T16:00:00.000Z", false)
        )
        for ((date, completion, assisted) in rows) {
            val session = createSession(
                fixture().puzzle,
                SessionMetadata.Daily(date, true),
                dev.sudoku.app.model.dailyFormalId(date, Variant.CLASSIC),
                "${date}T00:00:00.000Z"
            )
                .copy(
                    elapsedMs = 200,
                    completion = Completion(completion, 200),
                    assistance = dev.sudoku.app.model.Assistance(assisted = assisted)
                )
            repository.writeSession(session, 0, repository.claimEditor(session.id, "owner").value()).value()
        }
        val reads = RoomReadRepository(database, validator)
        val summary = reads.readOverview(Variant.CLASSIC, "2026-10-16").value().summary

        assertEquals(dev.sudoku.app.model.DailyTotals(1, 2), summary.dailyTotals)
        assertEquals(2, summary.currentStreak)
        assertEquals(2, summary.longestStreak)
        assertEquals(0, reads.readOverview(Variant.CLASSIC, "2026-10-17").value().summary.currentStreak)
    }

    @Test fun readyPageQueryUsesItsOrderingIndexWithoutATemporarySort() {
        val query = "EXPLAIN QUERY PLAN SELECT id FROM result_summaries " +
            "WHERE version=1 AND variant='classic' AND (completedAt,id)<(9223372036854775807,'') " +
            "ORDER BY completedAt DESC,id DESC LIMIT 31"
        val plans = database.openHelper.readableDatabase.query(query).use { cursor ->
            buildList { while (cursor.moveToNext()) add(cursor.getString(3)) }
        }

        assertTrue(plans.toString(), plans.any { it.contains("index_result_summaries_variant_completedAt_id") })
        assertTrue(plans.toString(), plans.none { it.contains("TEMP B-TREE") })
    }

    @Test fun clearingDuringDetailValidationCannotResurrectAProjection() = runTest {
        val session = fixture()
        repository.writeSession(session, 0, repository.claimEditor(session.id, "owner").value()).value()
        val entered = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val blocked = object : MathematicalValidator by validator {
            override suspend fun validatePuzzle(content: PuzzleContent): EngineOutcome<Validation> {
                entered.complete(Unit)
                release.await()
                return EngineOutcome.Completed(Validation.Valid)
            }
        }
        val reads = RoomReadRepository(database, blocked)
        val reading = async { reads.readSession(session.id) }
        entered.await()
        repository.clearAll(0).value()
        release.complete(Unit)

        assertTrue(reading.await() is StorageOutcome.Failure)
        assertTrue(reads.readPage().value().items.isEmpty())
    }

    @Test fun presentationReadsNeverDecodeOrValidateFullPayloads() = runTest {
        val session = fixture()
        val token = repository.claimEditor(session.id, "owner").value()
        repository.writeSession(session, 0, token).value()
        val reads = RoomReadRepository(database, validator)
        validationCalls = 0

        val home = reads.readBootstrap().value()
        val page = reads.readPage().value()
        reads.readDaily("2026-10-17").value()
        reads.readOverview(Variant.CLASSIC, "2026-10-17").value()

        assertTrue(home.home.hasSaves)
        assertEquals(session.id, page.items.single().summary?.id)
        assertEquals(0, validationCalls)
        reads.readSession(session.id).value()
        assertTrue(validationCalls > 0)
    }

    @Test fun legacyRowsArePendingAndSelectedReadsIgnoreUnrelatedCorruption() = runTest {
        val session = fixture()
        val token = repository.claimEditor(session.id, "owner").value()
        repository.writeSession(session, 0, token).value()
        database.summaryDao().clearSessions()
        database.sudokuDao().putSession(SessionEntity("corrupt", 1, "FREE", "classic", null, "broken"))
        val reads = RoomReadRepository(database, validator)

        assertTrue(reads.readBootstrap().value().home.pending)
        assertTrue(reads.readPage().value().items.all { it.summary == null })
        assertEquals(session.id, reads.readSession(session.id).value()?.session?.id)
        assertEquals(0, repository.countQuarantined().value())
        reads.backfill()
        assertEquals(1, repository.countQuarantined().value())
        assertTrue(!reads.readBootstrap().value().home.pending)
    }

    @Test fun originalResultProjectionRetainsFirstCompletionAndImportRebuildsIt() = runTest {
        val session = fixture().copy(elapsedMs = 500, completion = Completion("2026-10-16T01:02:04.000Z", 500))
        val token = repository.claimEditor(session.id, "owner").value()
        repository.writeSession(session, 0, token).value()
        repository.writeSession(
            session.copy(elapsedMs = 900, completion = Completion("2026-10-16T01:02:05.000Z", 900)),
            1,
            token
        ).value()
        val reads = RoomReadRepository(database, validator)

        assertEquals(500L, reads.readPage(results = true).value().items.single().summary?.elapsedMs)
        // Reopening an original result returns the active session to unfinished state.
        repository.writeSession(session.copy(elapsedMs = 900, completion = null), 2, token).value()
        val backup = repository.exportBackup("2026-10-17T00:00:00.000Z").value()
        repository.restoreBackup(repository.previewBackup(backup.text).value()).value()
        assertEquals(500L, reads.readPage(results = true).value().items.single().summary?.elapsedMs)
        assertTrue(!reads.readBootstrap().value().home.pending)
    }

    @Test fun staleRevisionAndReplacedDatasetRejectQueuedWrites() = runTest {
        val session = fixture()
        val token = repository.claimEditor(session.id, "owner").value()
        repository.writeSession(session, 0, token).value()

        val staleRevision = repository.writeSession(session, 0, token)
        val backup = repository.exportBackup("2026-10-16T01:02:03.000Z").value()
        val preview = repository.previewBackup(backup.text).value()
        repository.restoreBackup(preview).value()
        val staleEpoch = repository.writeSession(session, 1, token)

        assertEquals(StorageFailureKind.REVISION_CONFLICT, (staleRevision as StorageOutcome.Failure).error.kind)
        assertEquals(StorageFailureKind.REVISION_CONFLICT, (staleEpoch as StorageOutcome.Failure).error.kind)
        assertEquals(1L, repository.listSessions().value().single().revision)
        assertEquals(1L, repository.readDatasetEpoch().value())
    }

    @Test fun lessonCompletionRetryPreservesItsFirstTimestamp() = runTest {
        val epoch = repository.readDatasetEpoch().value()
        val first = dev.sudoku.app.model.LessonProgress("rules", "2026-10-16T01:02:03.004Z")
        val retried = first.copy(completedAt = "2026-10-16T01:02:04.005Z")
        repository.writeLessonProgress(first, epoch).value()

        repository.writeLessonProgress(retried, epoch).value()

        assertEquals(listOf(first), repository.readLessonProgress().value())
    }

    @Test fun firstCompletionRemainsOriginalAcrossReplayedWrites() = runTest {
        val session = fixture()
        val original = session.copy(elapsedMs = 500, completion = Completion("2026-10-16T01:02:04.000Z", 500))
        val token = repository.claimEditor(session.id, "owner").value()
        repository.writeSession(original, 0, token).value()

        repository.writeSession(
            original.copy(elapsedMs = 900, completion = Completion("2026-10-16T01:02:05.000Z", 900)),
            1,
            token
        ).value()

        assertEquals(500L, repository.listResults().value().single().session.elapsedMs)
        assertEquals(
            "2026-10-16T01:02:04.000Z",
            repository.listResults().value().single().session.completion?.completedAt
        )
    }

    @Test fun previewConflictPreservesSettingsAndEveryCollection() = runTest {
        val epoch = repository.readDatasetEpoch().value()
        val backup = repository.exportBackup("2026-10-16T01:02:03.000Z").value()
        val preview = repository.previewBackup(backup.text).value()
        repository.clearAll(epoch).value()
        repository.writeSettings(Settings(theme = ThemePreference.DARK), 1).value()

        val failure = repository.restoreBackup(preview)

        assertTrue(failure is StorageOutcome.Failure)
        assertEquals(ThemePreference.DARK, repository.readSettings().value().theme)
        assertEquals(1L, repository.readDatasetEpoch().value())
    }

    @Test fun inconclusiveValidationDoesNotQuarantineStoredFacts() = runTest {
        val session = fixture()
        val token = repository.claimEditor(session.id, "owner").value()
        repository.writeSession(session, 0, token).value()
        val unavailable = object : MathematicalValidator by validator {
            override suspend fun validatePuzzle(content: PuzzleContent): EngineOutcome<Validation> =
                EngineOutcome.BudgetExhausted()
        }
        val unavailableRepository = RoomGameRepository(database, unavailable)

        val result = unavailableRepository.listSessions()

        assertEquals(StorageFailureKind.UNAVAILABLE, (result as StorageOutcome.Failure).error.kind)
        assertEquals(1, database.sudokuDao().sessions().size)
        assertEquals(0, repository.countQuarantined().value())
    }

    @Test fun replacementFailureRollsBackEveryCollectionAndEpoch() = runTest {
        val session = fixture()
        val token = repository.claimEditor(session.id, "owner").value()
        repository.writeSession(session, 0, token).value()
        repository.writeSettings(Settings(theme = ThemePreference.DARK), 0).value()
        val exported = repository.exportBackup("2026-10-16T01:02:03.000Z").value()
        val preview = repository.previewBackup(exported.text).value()
        database.openHelper.writableDatabase.execSQL(
            "CREATE TRIGGER fail_restore BEFORE INSERT ON settings BEGIN SELECT RAISE(ABORT, 'fixture rollback'); END"
        )

        val failure = repository.restoreBackup(preview)

        assertTrue(failure is StorageOutcome.Failure)
        assertEquals(0L, repository.readDatasetEpoch().value())
        assertEquals(session.id, repository.listSessions().value().single().session.id)
        assertEquals(ThemePreference.DARK, repository.readSettings().value().theme)
    }

    @Test fun validatorReturningAfterAnotherRepositoryRestoreCannotRepopulateDataset() = runTest {
        val session = fixture()
        val token = repository.claimEditor(session.id, "owner").value()
        val entered = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val delayed = object : MathematicalValidator by validator {
            override suspend fun validatePuzzle(content: PuzzleContent): EngineOutcome<Validation> {
                entered.complete(Unit)
                release.await()
                return EngineOutcome.Completed(Validation.Valid)
            }
        }
        val oldRepository = RoomGameRepository(database, delayed)
        val oldWrite = async { oldRepository.writeSession(session, 0, token) }
        entered.await()
        val exported = repository.exportBackup("2026-10-16T01:02:03.000Z").value()
        repository.restoreBackup(repository.previewBackup(exported.text).value()).value()

        release.complete(Unit)
        val outcome = oldWrite.await()

        assertEquals(StorageFailureKind.REVISION_CONFLICT, (outcome as StorageOutcome.Failure).error.kind)
        assertTrue(repository.listSessions().value().isEmpty())
    }

    private fun fixture(): GameSession {
        val solution = List(81) { (it % 9 + it / 9 * 3 + it / 27) % 9 + 1 }
        val puzzle =
            Puzzle(List(81) { 0 }, solution, PuzzleRules.Classic, Difficulty.EASY, "01".repeat(32), "sudoku-v11")
        return createSession(puzzle, SessionMetadata.Free, "attempt", "2026-10-16T01:02:03.004Z")
    }

    private fun <T> StorageOutcome<T>.value(): T = when (this) {
        is StorageOutcome.Success -> value
        is StorageOutcome.Failure -> error("Unexpected storage failure: $error")
    }
}
