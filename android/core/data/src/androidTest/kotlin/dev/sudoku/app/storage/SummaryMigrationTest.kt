package dev.sudoku.app.storage

import androidx.room.Room
import androidx.room.testing.MigrationTestHelper
import androidx.test.core.app.ApplicationProvider
import androidx.test.platform.app.InstrumentationRegistry
import dev.sudoku.app.model.Difficulty
import dev.sudoku.app.model.EngineOutcome
import dev.sudoku.app.model.MathematicalValidator
import dev.sudoku.app.model.PuzzleAssessment
import dev.sudoku.app.model.PuzzleContent
import dev.sudoku.app.model.StorageOutcome
import dev.sudoku.app.model.Validation
import dev.sudoku.app.model.Variant
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class SummaryMigrationTest {
    @get:Rule val helper = MigrationTestHelper(InstrumentationRegistry.getInstrumentation(), SudokuDatabase::class.java)

    @Test fun completeVersionTwoCoverageBecomesPendingWithoutDecodingCanonicalRows() = runTest {
        val name = "summary-versioned-coverage"
        helper.createDatabase(name, 2).use {
            it.execSQL("INSERT INTO summary_version(id,generation,sessionsComplete,resultsComplete) VALUES(1,4,1,1)")
            for (index in 0 until 35) {
                val id = "legacy-$index"
                it.execSQL(
                    "INSERT INTO sessions(id,revision,mode,variant,challengeDate,payload) VALUES ('$id',1,'FREE','classic',NULL,'unread canonical payload')"
                )
                it.execSQL(
                    "INSERT INTO session_summaries(id,revision,mode,variant,difficulty,startedAt,elapsedMs,completedAt,assisted,challengeDate,formalAttempt,lessonId,filled,editable,eligibleDate,version) VALUES('$id',1,'FREE','classic','EASY',0,0,NULL,0,NULL,NULL,NULL,0,81,NULL,1)"
                )
            }
        }
        val database = Room.databaseBuilder(
            ApplicationProvider.getApplicationContext(),
            SudokuDatabase::class.java,
            name
        ).addMigrations(SchemaMigrations.version2To3).build()
        val unavailable = object : MathematicalValidator {
            override suspend fun validatePuzzle(content: PuzzleContent): EngineOutcome<Validation> =
                error("Migration must not invoke native validation")

            override suspend fun validateAssessment(
                value: PuzzleAssessment?,
                variant: Variant,
                difficulty: Difficulty
            ): EngineOutcome<PuzzleAssessment?> = error("Migration must not validate assessments")
        }
        try {
            val reads = RoomReadRepository(database, unavailable)
            val page = (reads.readPage() as StorageOutcome.Success).value
            val secondPage = reads.readPage(cursor = page.next)
            assertTrue(
                "The first migrated cursor must remain appendable: $secondPage",
                secondPage is StorageOutcome.Success
            )
            val next = (secondPage as StorageOutcome.Success).value
            val bootstrap = (reads.readBootstrap() as StorageOutcome.Success).value

            assertTrue(bootstrap.home.pending)
            assertEquals(35, (page.items + next.items).map { it.id }.toSet().size)
            assertTrue((page.items + next.items).all { it.summary == null })
            assertEquals("unread canonical payload", database.sudokuDao().session("legacy-0")?.payload)
            assertEquals(CURRENT_PROJECTION_VERSION, database.summaryDao().coverage()?.projectionVersion)
        } finally {
            database.close()
        }
    }

    @Test fun schemaUpgradePreservesPayloadWithoutDecodingItAtStartup() = runTest {
        val name = "summary-migration"
        helper.createDatabase(name, 1).use {
            it.execSQL(
                "INSERT INTO sessions(id,revision,mode,variant,challengeDate,payload) VALUES ('legacy',1,'FREE','classic',NULL,'unread legacy payload')"
            )
        }
        val database = Room.databaseBuilder(
            ApplicationProvider.getApplicationContext(),
            SudokuDatabase::class.java,
            name
        ).addMigrations(SchemaMigrations.version2To3).build()
        val unavailable = object : MathematicalValidator {
            override suspend fun validatePuzzle(content: PuzzleContent): EngineOutcome<Validation> =
                error("Unexpected startup validation")

            override suspend fun validateAssessment(
                value: PuzzleAssessment?,
                variant: Variant,
                difficulty: Difficulty
            ): EngineOutcome<PuzzleAssessment?> = error("Unexpected startup assessment")
        }
        try {
            val reads = RoomReadRepository(database, unavailable)
            val bootstrap = reads.readBootstrap() as StorageOutcome.Success

            assertTrue(bootstrap.value.home.pending)
            assertEquals("unread legacy payload", database.sudokuDao().session("legacy")?.payload)
            val page = reads.readPage() as StorageOutcome.Success
            assertEquals("legacy", page.value.items.single().id)
            assertEquals(null, page.value.items.single().summary)
        } finally {
            database.close()
        }
    }
}
