package dev.sudoku.app.storage

import androidx.room.Room
import androidx.room.withTransaction
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import dev.sudoku.app.model.Assistance
import dev.sudoku.app.model.Completion
import dev.sudoku.app.model.DailyStatus
import dev.sudoku.app.model.DailyTotals
import dev.sudoku.app.model.Difficulty
import dev.sudoku.app.model.EngineOutcome
import dev.sudoku.app.model.GameMode
import dev.sudoku.app.model.GameSession
import dev.sudoku.app.model.LessonProgress
import dev.sudoku.app.model.MathematicalValidator
import dev.sudoku.app.model.Puzzle
import dev.sudoku.app.model.PuzzleAssessment
import dev.sudoku.app.model.PuzzleContent
import dev.sudoku.app.model.PuzzleRules
import dev.sudoku.app.model.SessionMetadata
import dev.sudoku.app.model.SettingsUpdate
import dev.sudoku.app.model.StorageFailureKind
import dev.sudoku.app.model.StorageOutcome
import dev.sudoku.app.model.SummaryQuery
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

    @Test fun staleGamePreferenceWritePreservesLaterThemeAndLearningCursor() = runTest {
        val cachedGameSettings = repository.readSettings().value()
        repository.updateSettings(SettingsUpdate.Theme(ThemePreference.DARK), 0).value()
        repository.updateSettings(SettingsUpdate.LessonCursor("rules", 1), 0).value()

        repository.updateSettings(SettingsUpdate.ShowTimer(!cachedGameSettings.showTimer), 0).value()

        val settings = repository.readSettings().value()
        assertEquals(ThemePreference.DARK, settings.theme)
        assertEquals("rules", settings.currentLessonId)
        assertEquals(mapOf("rules" to 1), settings.lessonStages)
        assertEquals(false, settings.showTimer)
    }

    @Test fun obsoleteAndMalformedProjectionsNeverAuthorizeDailyCompletion() = runTest {
        val date = "2026-10-16"
        val id = dev.sudoku.app.model.dailyFormalId(date, Variant.CLASSIC)
        val session = fixture().copy(
            id = id,
            mode = GameMode.DAILY,
            metadata = SessionMetadata.Daily(date, true)
        )
        repository.writeSession(session, 0, repository.claimEditor(id, "owner").value()).value()
        val summary = requireNotNull(database.summaryDao().session(id))
        val reads = RoomReadRepository(database, validator)

        for (invalid in listOf(
            summary.copy(version = 0),
            summary.copy(revision = 0),
            summary.copy(facts = summary.facts.copy(elapsedMs = -1, completedAt = 1))
        )) {
            database.summaryDao().putSession(invalid)

            assertEquals(
                DailyStatus.PENDING,
                reads.readDaily(date).value().statuses.getValue(Variant.CLASSIC)
            )
            assertTrue(database.sudokuDao().session(id) != null)
        }
    }

    @Test fun obsoleteResultProjectionDoesNotContributeToOverview() = runTest {
        val session = fixture().copy(elapsedMs = 500, completion = Completion("2026-10-16T01:02:04.000Z", 500))
        repository.writeSession(session, 0, repository.claimEditor(session.id, "owner").value()).value()
        val summary = requireNotNull(database.summaryDao().result(session.id))
        database.summaryDao().deleteResult(session.id)
        database.summaryDao().putResult(summary.copy(version = 0))

        val overview = RoomReadRepository(database, validator).readOverview(Variant.CLASSIC, "2026-10-16").value()

        assertEquals(null, overview.summary.freeBests.getValue(Difficulty.EASY).unassisted)
        assertTrue(overview.pending)
        assertTrue(database.sudokuDao().result(session.id) != null)
    }

    @Test fun historyPagesHaveStableTieBreakingAndRejectAnOldDatasetCursor() = runTest {
        val base = fixture().copy(elapsedMs = 500, completion = Completion("2026-10-16T01:02:04.000Z", 500))
        for (index in 0 until 65) {
            val session = base.copy(id = "result-${index.toString().padStart(3, '0')}")
            repository.writeSession(session, 0, repository.claimEditor(session.id, "owner").value()).value()
        }
        val reads = RoomReadRepository(database, validator)
        validationCalls = 0
        val first = reads.readPage(query = SummaryQuery.History()).value()
        val second = reads.readPage(query = SummaryQuery.History(), cursor = first.next).value()
        val third = reads.readPage(query = SummaryQuery.History(), cursor = second.next).value()

        assertEquals(30, first.items.size)
        assertEquals(30, second.items.size)
        assertEquals(5, third.items.size)
        assertEquals(65, (first.items + second.items + third.items).map { it.id }.toSet().size)
        assertEquals(0, validationCalls)
        val cursor = checkNotNull(first.next)
        assertEquals(SummaryQuery.History(), cursor.query)
        val wrongSource = reads.readPage(SummaryQuery.Saves(), cursor)
        val wrongVariant = reads.readPage(SummaryQuery.History(Variant.DIAGONAL), cursor)
        assertEquals(StorageFailureKind.REVISION_CONFLICT, (wrongSource as StorageOutcome.Failure).error.kind)
        assertEquals(StorageFailureKind.REVISION_CONFLICT, (wrongVariant as StorageOutcome.Failure).error.kind)
        repository.clearAll(first.epoch).value()
        assertTrue(
            reads.readPage(
                query = SummaryQuery.History(),
                cursor = first.next
            ) is StorageOutcome.Failure
        )
    }

    @Test fun backfillInvalidatesPaginationBeforePendingRowsCanRepeat() = runTest {
        for (index in 0 until 35) {
            val session = fixture().copy(id = "pending-${index.toString().padStart(2, '0')}")
            repository.writeSession(session, 0, repository.claimEditor(session.id, "owner").value()).value()
        }
        database.summaryDao().clearSessions()
        val reads = RoomReadRepository(database, validator)
        val first = reads.readPage(query = SummaryQuery.Saves(unfinishedOnly = true)).value()
        assertEquals(30, first.items.size)
        assertTrue(first.items.all { it.summary == null })

        reads.readSession(first.items.first().id).value()
        val stale = reads.readPage(
            query = SummaryQuery.Saves(unfinishedOnly = true),
            cursor = first.next
        )

        assertEquals(StorageFailureKind.REVISION_CONFLICT, (stale as StorageOutcome.Failure).error.kind)
        val refreshed = reads.readPage(query = SummaryQuery.Saves(unfinishedOnly = true)).value()
        val rest = reads.readPage(
            query = SummaryQuery.Saves(unfinishedOnly = true),
            cursor = refreshed.next
        ).value()
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
            assertEquals(
                minOf(count, 30),
                reads.readPage(query = SummaryQuery.History()).value().items.size
            )
            val overview = reads.readOverview(Variant.CLASSIC, "2026-10-17").value()
            assertEquals(
                if (count == 0) {
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

    @Test fun malformedPracticeProjectionCannotBecomeAFormalDailyResult() = runTest {
        val date = "2026-10-16"
        val cases = listOf(
            Triple(PuzzleRules.Classic, "practice", Variant.CLASSIC),
            Triple(PuzzleRules.Diagonal, "daily:2026-10-16:formal", Variant.DIAGONAL)
        )
        for ((rules, id, variant) in cases) {
            val session = createSession(
                fixture().puzzle.copy(
                    rules = rules,
                    puzzleVersion = if (variant == Variant.CLASSIC) "sudoku-v11" else "sudoku-variants-v11"
                ),
                SessionMetadata.Daily(date, false),
                id,
                "2026-10-16T00:00:00.000Z"
            ).copy(elapsedMs = 200, completion = Completion("2026-10-17T01:00:00.000Z", 200))
            repository.writeSession(session, 0, repository.claimEditor(id, "owner").value()).value()
            val canonical = database.sudokuDao().result(id)
            val originalProjection = requireNotNull(database.summaryDao().result(id))
            database.summaryDao().deleteResult(id)
            database.summaryDao().putResult(
                originalProjection.copy(facts = originalProjection.facts.copy(formalAttempt = true))
            )
            val reads = RoomReadRepository(database, validator)

            val overview = reads.readOverview(variant, date).value()

            assertEquals(DailyTotals(), overview.summary.dailyTotals)
            assertTrue(overview.pending)
            assertEquals(
                null,
                reads.readPage(
                    query = SummaryQuery.History(variant)
                ).value().items.single().summary
            )
            assertEquals(canonical, database.sudokuDao().result(id))
        }
    }

    @Test fun historicalShanghaiSummerTimeRetainsAValidFormalResult() = runTest {
        // Shanghai observed UTC+9 on this date: 15:30 UTC is 00:30 on July 2.
        val id = "daily:1990-07-02:formal"
        val session = createSession(
            fixture().puzzle,
            SessionMetadata.Daily("1990-07-02", true),
            id,
            "1990-07-01T15:00:00.000Z"
        ).copy(elapsedMs = 200, completion = Completion("1990-07-01T15:30:00.000Z", 200))
        repository.writeSession(session, 0, repository.claimEditor(id, "owner").value()).value()
        val canonical = database.sudokuDao().result(id)
        val reads = RoomReadRepository(database, validator)

        val overview = reads.readOverview(Variant.CLASSIC, "1990-07-02").value()

        assertEquals(DailyTotals(unassisted = 1), overview.summary.dailyTotals)
        assertEquals(1, overview.summary.currentStreak)
        assertEquals(1, overview.summary.longestStreak)
        assertTrue(!overview.pending)
        assertTrue(
            reads.readPage(query = SummaryQuery.History()).value().items.single().summary != null
        )
        reads.backfill().value()
        assertTrue(!reads.readOverview(Variant.CLASSIC, "1990-07-02").value().pending)
        assertEquals(canonical, database.sudokuDao().result(id))
    }

    @Test fun malformedCalendarInvalidatesAnAppendedPageAndBackfillRepairsOnlyItsProjection() = runTest {
        val start = java.time.LocalDate.parse("2026-08-01")
        for (offset in 0 until 35) {
            val date = start.plusDays(offset.toLong()).toString()
            val session = createSession(
                fixture().puzzle,
                SessionMetadata.Daily(date, true),
                "daily:$date:formal",
                "${date}T00:00:00.000Z"
            ).copy(elapsedMs = 200, completion = Completion("${date}T01:00:00.000Z", 200))
            repository.writeSession(session, 0, repository.claimEditor(session.id, "owner").value()).value()
        }
        val reads = RoomReadRepository(database, validator)
        val first = reads.readPage(query = SummaryQuery.History()).value()
        val id = "daily:2026-08-01:formal"
        val canonical = database.sudokuDao().result(id)
        val projection = requireNotNull(database.summaryDao().result(id))
        // Simulate malformed persisted projection bytes without cooperating with coverage/generation writes.
        database.summaryDao().removeResult(id)
        database.summaryDao().insertResult(projection.copy(facts = projection.facts.copy(eligibleDate = null)))

        val appended = reads.readPage(query = SummaryQuery.History(), cursor = first.next)

        assertEquals(StorageFailureKind.REVISION_CONFLICT, (appended as StorageOutcome.Failure).error.kind)
        assertEquals(null, database.summaryDao().selectResult(id))
        val refreshed = reads.readPage(query = SummaryQuery.History()).value()
        assertEquals(id, refreshed.items.first().id)
        assertEquals(null, refreshed.items.first().summary)
        val rest = reads.readPage(query = SummaryQuery.History(), cursor = refreshed.next).value()
        assertEquals(35, (refreshed.items + rest.items).map { it.id }.toSet().size)
        val incomplete = reads.readOverview(Variant.CLASSIC, "2026-09-04").value()
        assertEquals(DailyTotals(unassisted = 34), incomplete.summary.dailyTotals)
        assertTrue(incomplete.pending)
        reads.backfill().value()
        val repaired = reads.readOverview(Variant.CLASSIC, "2026-09-04").value()
        assertEquals(DailyTotals(unassisted = 35), repaired.summary.dailyTotals)
        assertTrue(!repaired.pending)
        assertEquals(canonical, database.sudokuDao().result(id))

        database.summaryDao().removeResult(id)
        database.summaryDao().insertResult(projection.copy(facts = projection.facts.copy(eligibleDate = null)))
        assertEquals(null, database.summaryDao().result(id))
        reads.readResult(id).value()
        assertEquals(canonical, database.sudokuDao().result(id))
    }

    @Test fun dailyStatisticsCrossMultipleCompactBatchesWithoutPayloadValidation() = runTest {
        val start = java.time.LocalDate.parse("2026-01-01")
        for (offset in 0 until 260) {
            val date = start.plusDays(offset.toLong()).toString()
            val session = createSession(
                fixture().puzzle,
                SessionMetadata.Daily(date, true),
                "daily:$date:formal",
                "${date}T00:00:00.000Z"
            ).copy(elapsedMs = 200, completion = Completion("${date}T01:00:00.000Z", 200))
            repository.writeSession(session, 0, repository.claimEditor(session.id, "owner").value()).value()
        }
        validationCalls = 0

        val overview = RoomReadRepository(database, validator).readOverview(Variant.CLASSIC, "2026-09-17").value()

        assertEquals(DailyTotals(unassisted = 260), overview.summary.dailyTotals)
        assertEquals(260, overview.summary.currentStreak)
        assertEquals(260, overview.summary.longestStreak)
        assertTrue(!overview.pending)
        assertEquals(0, validationCalls)
    }

    @Test fun dailyStatisticsQueryUsesItsCalendarOrderingIndexWithoutATemporarySort() {
        val query = "EXPLAIN QUERY PLAN SELECT p.id FROM result_summaries p WHERE " +
            CURRENT_RESULT + " AND p.variant='classic' AND p.mode='DAILY' " +
            "AND (p.challengeDate,p.id)<('9999-12-32','') ORDER BY p.challengeDate DESC,p.id DESC LIMIT 128"
        val plans = database.openHelper.readableDatabase.query(query).use { cursor ->
            buildList { while (cursor.moveToNext()) add(cursor.getString(3)) }
        }

        assertTrue(plans.toString(), plans.any { it.contains("index_result_summaries_variant_mode_challengeDate_id") })
        assertTrue(plans.toString(), plans.none { it.contains("TEMP B-TREE") })
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
                    assistance = Assistance(assisted = assisted)
                )
            repository.writeSession(session, 0, repository.claimEditor(session.id, "owner").value()).value()
        }
        val reads = RoomReadRepository(database, validator)
        val summary = reads.readOverview(Variant.CLASSIC, "2026-10-16").value().summary

        assertEquals(DailyTotals(1, 2), summary.dailyTotals)
        assertEquals(2, summary.currentStreak)
        assertEquals(2, summary.longestStreak)
        assertEquals(0, reads.readOverview(Variant.CLASSIC, "2026-10-17").value().summary.currentStreak)
    }

    @Test fun readyPageQueryUsesItsOrderingIndexWithoutATemporarySort() {
        val query = "EXPLAIN QUERY PLAN SELECT p.id FROM result_summaries p WHERE " +
            CURRENT_RESULT + " AND p.variant='classic' " +
            "AND (completedAt,id)<(9223372036854775807,'') " +
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

        assertEquals(
            500L,
            reads.readPage(
                query = SummaryQuery.History()
            ).value().items.single().summary?.elapsedMs
        )
        // Reopening an original result returns the active session to unfinished state.
        repository.writeSession(session.copy(elapsedMs = 900, completion = null), 2, token).value()
        val backup = repository.exportBackup("2026-10-17T00:00:00.000Z").value()
        repository.restoreBackup(repository.previewBackup(backup.text).value()).value()
        assertEquals(
            500L,
            reads.readPage(
                query = SummaryQuery.History()
            ).value().items.single().summary?.elapsedMs
        )
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
        assertEquals(
            1L,
            requireNotNull(RoomReadRepository(database, validator).readSession(session.id).value()).revision
        )
        assertEquals(1L, repository.readDatasetEpoch().value())
    }

    @Test fun lessonCompletionRetryPreservesItsFirstTimestamp() = runTest {
        val epoch = repository.readDatasetEpoch().value()
        val first = LessonProgress("rules", "2026-10-16T01:02:03.004Z")
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

        assertEquals(
            500L,
            requireNotNull(RoomReadRepository(database, validator).readResult(session.id).value()).session.elapsedMs
        )
        assertEquals(
            "2026-10-16T01:02:04.000Z",
            requireNotNull(
                RoomReadRepository(database, validator).readResult(session.id).value()
            ).session.completion?.completedAt
        )
    }

    @Test fun previewConflictPreservesSettingsAndEveryCollection() = runTest {
        val epoch = repository.readDatasetEpoch().value()
        val backup = repository.exportBackup("2026-10-16T01:02:03.000Z").value()
        val preview = repository.previewBackup(backup.text).value()
        repository.clearAll(epoch).value()
        repository.updateSettings(SettingsUpdate.Theme(ThemePreference.DARK), 1).value()

        val failure = repository.restoreBackup(preview)

        assertTrue(failure is StorageOutcome.Failure)
        assertEquals(ThemePreference.DARK, repository.readSettings().value().theme)
        assertEquals(1L, repository.readDatasetEpoch().value())
    }

    @Test fun inconclusiveValidationDoesNotQuarantineStoredFacts() = runTest {
        val session = fixture()
        val token = repository.claimEditor(session.id, "owner").value()
        repository.writeSession(session, 0, token).value()
        val canonical = requireNotNull(database.sudokuDao().session(session.id))
        val outcomes =
            listOf(
                EngineOutcome.BudgetExhausted(),
                EngineOutcome.Cancelled,
                EngineOutcome.TimedOut,
                EngineOutcome.Failed("Temporarily unavailable")
            )
        for (outcome in outcomes) {
            val unavailable = object : MathematicalValidator by validator {
                override suspend fun validatePuzzle(content: PuzzleContent): EngineOutcome<Validation> = outcome
            }

            val result = RoomReadRepository(database, unavailable).readSession(session.id)

            assertEquals(StorageFailureKind.UNAVAILABLE, (result as StorageOutcome.Failure).error.kind)
            assertEquals(canonical, database.sudokuDao().session(session.id))
            assertEquals(0, repository.countQuarantined().value())
        }
    }

    @Test fun replacementFailureRollsBackEveryCollectionAndEpoch() = runTest {
        val session = fixture()
        val token = repository.claimEditor(session.id, "owner").value()
        repository.writeSession(session, 0, token).value()
        repository.updateSettings(SettingsUpdate.Theme(ThemePreference.DARK), 0).value()
        val exported = repository.exportBackup("2026-10-16T01:02:03.000Z").value()
        val preview = repository.previewBackup(exported.text).value()
        database.openHelper.writableDatabase.execSQL(
            "CREATE TRIGGER fail_restore BEFORE INSERT ON settings BEGIN SELECT RAISE(ABORT, 'fixture rollback'); END"
        )

        val failure = repository.restoreBackup(preview)

        assertTrue(failure is StorageOutcome.Failure)
        assertEquals(0L, repository.readDatasetEpoch().value())
        assertEquals(
            session.id,
            requireNotNull(RoomReadRepository(database, validator).readSession(session.id).value()).session.id
        )
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
        assertTrue(database.sudokuDao().sessions().isEmpty())
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
