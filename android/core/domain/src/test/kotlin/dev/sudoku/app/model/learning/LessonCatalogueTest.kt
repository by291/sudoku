package dev.sudoku.app.model.learning

import dev.sudoku.app.model.Placement
import dev.sudoku.app.model.Variant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class LessonCatalogueTest {
    private fun content(): String = checkNotNull(javaClass.classLoader.getResourceAsStream("lessons/catalogue.json")) {
        "Shared lesson catalogue must be packaged as a model test resource"
    }.bufferedReader().use { it.readText() }

    @Test
    fun `loads the original thirty two course identities and all eighty four stages`() {
        val catalogue = LessonCatalogue.decode(content())
        val expectedIds = listOf(
            "rules", "naked-single", "hidden-single", "locked-candidate", "naked-pair", "hidden-pair",
            "naked-triple", "hidden-triple", "x-wing", "swordfish", "xy-wing", "simple-coloring",
            "diagonal-rules", "diagonal-singles", "diagonal-intersections", "diagonal-combined",
            "jigsaw-rules", "jigsaw-singles", "jigsaw-intersections", "jigsaw-combined",
            "killer-rules", "killer-remainder", "killer-combinations", "killer-combined",
            "thermo-rules", "thermo-bounds", "thermo-interactions", "thermo-combined",
            "arrow-rules", "arrow-equations", "arrow-combinations", "arrow-combined"
        )

        assertEquals(expectedIds, catalogue.lessons.map { it.id })
        assertEquals(84, catalogue.lessons.sumOf { it.stages.size })
        assertEquals(ExerciseAnswer.Place(Placement(40, 5)), catalogue.lesson("rules")?.guided?.answer)
        assertEquals(ExerciseAnswer.Place(Placement(40, 2)), catalogue.lesson("arrow-rules")?.guided?.answer)
        assertEquals(Variant.ARROW, catalogue.lesson("arrow-combined")?.practiceVariant)
        assertNull(catalogue.lesson("unknown-historical-completion"))

        for (lesson in catalogue.lessons) {
            assertEquals(if (lesson.id.endsWith("-combined")) 6 else 2, lesson.stages.size)
            assertEquals(lesson.guided, lesson.stages.first())
            assertTrue(lesson.practiceDifficulty in lesson.practiceVariant.difficulties)
            assertNotEquals(lesson.exercises[0].stages.first().answer, lesson.exercises[1].stages.first().answer)
            assertTrue(
                lesson.stages.all { stage ->
                    stage.board.size == 81 && stage.candidates.size == 81 &&
                        stage.explanation.isNotBlank()
                }
            )
        }
    }

    @Test
    fun `restores current cursor and refuses skipped or incorrect answers`() {
        val catalogue = LessonCatalogue.decode(content())
        val lesson = assertNotNull(catalogue.lesson("killer-combined"))
        var cursor = assertNotNull(catalogue.restoreCursor(lesson.id, 0))
        val skipped = catalogue.submit(cursor, lesson.stages[1].answer, submittedStageIndex = 1)
        val wrong = catalogue.submit(cursor, ExerciseAnswer.Place(Placement(80, 9)))

        assertFalse(skipped.correct)
        assertEquals(cursor, skipped.cursor)
        assertFalse(wrong.correct)
        assertEquals(cursor, wrong.cursor)
        assertEquals(0, catalogue.restoreCursor(lesson.id, 100)?.stageIndex)
        assertNull(catalogue.restoreCursor("missing", 0))

        lesson.stages.forEachIndexed { index, stage ->
            assertEquals(index, cursor.stageIndex)
            val result = catalogue.submit(cursor, stage.answer)

            assertTrue(result.correct)
            assertEquals(index == lesson.stages.lastIndex, result.completed)
            cursor = result.cursor
        }
        assertEquals(0, cursor.stageIndex)
    }

    @Test
    fun `compares eliminations as a set and rejects extra candidates`() {
        val catalogue = LessonCatalogue.decode(content())
        val lesson = assertNotNull(catalogue.lesson("hidden-pair"))
        val cursor = assertNotNull(catalogue.restoreCursor(lesson.id, 0))
        val answer = lesson.stages.first().answer as ExerciseAnswer.Eliminate

        assertTrue(
            catalogue.submit(
                cursor,
                ExerciseAnswer.Eliminate(answer.expected.reversed() + answer.expected.first())
            ).correct
        )
        assertFalse(catalogue.submit(cursor, ExerciseAnswer.Eliminate(answer.expected.drop(1))).correct)
        assertFalse(catalogue.submit(cursor, ExerciseAnswer.Eliminate(answer.expected + Placement(80, 9))).correct)
    }

    @Test
    fun `rejects incompatible schema and changed stable course ids`() {
        val json = content()

        assertFailsWith<IllegalArgumentException> {
            LessonCatalogue.decode(json.replaceFirst("\"schemaVersion\": 1", "\"schemaVersion\": 2"))
        }
        assertFailsWith<IllegalArgumentException> {
            LessonCatalogue.decode(json.replaceFirst("\"id\": \"rules\"", "\"id\": \"other\""))
        }
    }
}
