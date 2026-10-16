package dev.yigeyinian.sudoku.storage

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import dev.yigeyinian.sudoku.model.Completion
import dev.yigeyinian.sudoku.model.Difficulty
import dev.yigeyinian.sudoku.model.EngineOutcome
import dev.yigeyinian.sudoku.model.GameSession
import dev.yigeyinian.sudoku.model.MathematicalValidator
import dev.yigeyinian.sudoku.model.Puzzle
import dev.yigeyinian.sudoku.model.PuzzleAssessment
import dev.yigeyinian.sudoku.model.PuzzleContent
import dev.yigeyinian.sudoku.model.PuzzleRules
import dev.yigeyinian.sudoku.model.SessionMetadata
import dev.yigeyinian.sudoku.model.Settings
import dev.yigeyinian.sudoku.model.StorageFailureKind
import dev.yigeyinian.sudoku.model.StorageOutcome
import dev.yigeyinian.sudoku.model.ThemePreference
import dev.yigeyinian.sudoku.model.Validation
import dev.yigeyinian.sudoku.model.Variant
import dev.yigeyinian.sudoku.model.createSession
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
    private val validator = object : MathematicalValidator {
        override suspend fun validatePuzzle(content: PuzzleContent): EngineOutcome<Validation> =
            EngineOutcome.Completed(Validation.Valid)
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
        val first = dev.yigeyinian.sudoku.model.LessonProgress("rules", "2026-10-16T01:02:03.004Z")
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
