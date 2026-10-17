package dev.yigeyinian.sudoku.storage

import androidx.test.core.app.ApplicationProvider
import dev.yigeyinian.sudoku.model.EngineOutcome
import dev.yigeyinian.sudoku.model.learning.directoryEntry
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class LessonAssetsTest {
    @Test fun generatedDirectoryMatchesEveryIndependentlyLoadableLesson() = runTest {
        val repository = AssetLearningContentRepository(ApplicationProvider.getApplicationContext())
        assertEquals(32, repository.directory.size)
        assertEquals(32, repository.directory.map { it.id }.toSet().size)

        for (entry in repository.directory) {
            val result = repository.loadLesson(entry.id) as EngineOutcome.Completed
            assertEquals(listOf(entry), result.value.lessons.map { it.directoryEntry() })
        }
    }
}
