package dev.yigeyinian.sudoku.engine

import dev.yigeyinian.sudoku.model.EngineOutcome
import dev.yigeyinian.sudoku.model.LogicalStep
import dev.yigeyinian.sudoku.model.Validation
import dev.yigeyinian.sudoku.model.learning.LessonCatalogue
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlinx.coroutines.runBlocking

/** Validates the exact asset directory packaged by core:data, using the shipped Rust adapter. */
class BundledLearningContentTest {
    private fun catalogue(): LessonCatalogue {
        val source = File(checkNotNull(System.getProperty("sudoku.learningCatalogue")))
        return LessonCatalogue.decode(source.readText(Charsets.UTF_8))
    }

    @Test
    fun everyBundledStageHasValidMathematicalEvidence() = runBlocking<Unit> {
        val engine = RustSudokuEngine()
        val catalogue = catalogue()
        assertEquals(32, catalogue.lessons.size)
        assertEquals(84, catalogue.lessons.sumOf { it.stages.size })

        for (lesson in catalogue.lessons) {
            for ((index, stage) in lesson.stages.withIndex()) {
                val result = engine.validateTeachingStep(stage.board, stage.candidates, stage.rules, stage.step)
                val completed = assertIs<EngineOutcome.Completed<Validation>>(result, "${lesson.id} stage $index")
                assertEquals(Validation.Valid, completed.value, "${lesson.id} stage $index")
            }
        }
    }

    @Test
    fun aStructurallyValidButFalseConclusionFailsTheNativeCheck() = runBlocking<Unit> {
        val stage = catalogue().lessons.first().stages.first()
        // The authored center has only candidate 5. Digit 4 is in range but cannot follow from it.
        val falseStep = assertIs<LogicalStep.Place>(stage.step).copy(digit = 4)
        val result = RustSudokuEngine().validateTeachingStep(stage.board, stage.candidates, stage.rules, falseStep)

        assertIs<Validation.Invalid>(assertIs<EngineOutcome.Completed<Validation>>(result).value)
    }
}
