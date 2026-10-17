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
        ).build()
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
